#!/usr/bin/env nodejs

const fs = require('fs')
const express = require('express')
const puppeteer = require('puppeteer');
const conf = require('./conf')
const helpers = require('./helpers')

require('console-stamp')(console, 'HH:MM:ss.l');


const with_puppeteer = async (doit) => {
    const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
    const page = await browser.newPage();
    try {
        return await doit(page)
    } catch (err) {
        const prefix = conf.dumps_on_error_directory + "/" + new Date().toISOString()
        fs.writeFileSync(prefix + ".html", await page.$eval('body', elt => elt.innerHTML))
        await page.screenshot({ path: prefix + ".png" })
        console.error("dumped last state of browser in files " + prefix + ".*")
        throw err;
    } finally {
        await browser.close();
    }
}

const login = async (page) => {

    await helpers.do_and_waitForNavigation(page, 'first page', () => page.goto(conf.base_url + '/management?id=home'));

    await helpers.SPA_step(page, 'login', async () => {
        await page.waitFor("#username")
        await page.type("#username", conf.admin_login)
        await page.type("#password", conf.admin_password)
    }, 'button[name=login]')
    
    await helpers.SPA_step(page, 'subscribe user', async () => {        
    }, '.block-mobile [href="?id=subscribe_user"]')
}

const assign_free_phoneNumber = (wanted_user_mail, mac_address) => async (page) => {
    await login(page)

    await helpers.SPA_step(page, 'chose user & profile', async () => {
        await helpers.add_ids_to_allow_CSS_selector(page, "SPM-Email")
        await page.type('#SPM-Email input', wanted_user_mail + '\n')
        await helpers.handle_select2(page, '#SPM-Profile', 'Basic profile', 'exact')
        if (!await page.$eval('#SPM-Company .select2-chosen', elt => elt && elt.innerText === 'UNIVERSITE PARIS 1 PANTHEON-SORBONNE')) {
            throw "Utilisateur inconnu ou avec déjà un téléphone";
        }
        if (!await page.$eval('#SPM-Site .select2-chosen', elt => elt && elt.textContent === 'LOURCINE')) {
            await helpers.handle_select2(page, '#SPM-Site', 'LOURCINE', 'exact')
        }
    }, 'button[name=submit]');

    let chosen_phoneNumber;
    
    await helpers.SPA_step(page, 'profile options', async () => {
        await helpers.add_ids_to_allow_CSS_selector(page, 'SPM-Activation-Date')
        await page.type('#SPM-Activation-Date input[type=text]', new Date().toLocaleDateString("fr"));
        await helpers.handle_select2(page, '#SPM-Call-rights', 'National (no special numbers)', 'exact')
        await helpers.handle_select2(page, '#SPM-Redirection-rights', 'National without special numbers', 'exact')
        await helpers.handle_select2(page, '#SPM-Number-type', 'Public number (DID)', 'exact')
        chosen_phoneNumber = await helpers.handle_select2_fuzzy(page, '#SPM-Public-number--DID', 'Free', choices => choices[1].replace(/Free$/, ''));
        console.log("===================>", chosen_phoneNumber)
        await helpers.handle_select2(page, '#SPM-Temporary-phone-mobility', 'No', 'exact')
        await helpers.handle_select2(page, '#SPM-Device-Type', 'IP Phone', 'exact')
        await helpers.handle_select2(page, '#SPM-IP-Phone', 'Cisco 7821-BAS', 'substring')
        await page.type('#SPM-MAC-Adress input[type=string]', mac_address)
        // TODO "#SPM-Urgent-request" ?
    }, 'button[name=submit]');

    await page.waitFor(() => (
        document.querySelector('button[name=submit]').textContent === 'Submitted'
    ))

    return chosen_phoneNumber;
}

function http_server() {
    const app = express()
    
    app.get('/', (req, res) => {
        if (req.query.mac_address && req.query.wanted_user_mail) {
            const { wanted_user_mail, mac_address } = req.query;
            with_puppeteer(assign_free_phoneNumber(wanted_user_mail, mac_address.toUpperCase())).then(chosen_phoneNumber => {
                const msg = `Numéro ${chosen_phoneNumber} assigné à ${wanted_user_mail} (${mac_address})`
                console.log(msg)
                res.send(msg)
            }, err => {
                console.error(err)
                res.send(err)
            })
            return;
        }
        res.send(`
        <html>
        <form>
            <label>Email</label>
            <br>
            <input name="wanted_user_mail" size="40" type="email" required>
            <br><br>
            <label>Adresse MAC (sans séparateurs)</label>
            <br>
            <input name="mac_address" type="text" pattern="[0-9a-fA-F]{12}" size="12" required>
            <br><br>
            <input type="submit" value="Assigner un numéro de téléphone disponible">
        </form>
        </html>
        `)
    });
    app.listen(conf.http_server.port, () => console.log(`Started on port ${conf.http_server.port}!`))
}

const get_sys_user = async (page) => {
    await login(page)

    await helpers.do_and_waitForNavigation(page, 'user list', () => page.goto(conf.base_url + '/sys_user_list.do'))

    await page.click("#sys_user_table .icon-menu", { button: 'right' })

    const exportElt = await page.waitFor(() => (
        Array.from(document.querySelectorAll("#context_list_headersys_user > .context_item")).find(e => e.textContent === 'Export')
    ));
    await exportElt.click();

    const exportJson_item_id = await page.evaluate(() => (
        Array.from(document.querySelectorAll("#context_list_headersys_user ~ div > .context_item")).find(e => e.textContent === 'JSON').getAttribute('item_id')
    ))
    await page.click(`[item_id="${exportJson_item_id}"]`);

    const export_file = conf.download_directory + '/sys_user.json'
    if (fs.existsSync(export_file)) fs.unlinkSync(export_file)

    await page._client.send('Page.setDownloadBehavior', {
        behavior: 'allow',
        downloadPath: conf.download_directory,
    });

    await helpers.click_when_visible(page, '#download_button:not(.disabled)')    

    await helpers.waitForFile(page, export_file)

    return export_file
}

const sync_users = async () => {
    const export_file = await with_puppeteer(get_sys_user);
    //const export_file = conf.download_directory + '/sys_user.json'
    let { records } = JSON.parse(fs.readFileSync(export_file, 'utf8'));
    fs.unlinkSync(export_file)

    let users = records.filter(user => (
        user.u_external_number && user.u_profile_asset && user.u_directory_type === "company directory"
    )).map(user => (
        { uid: user.u_user_id, telephoneNumber: user.u_external_number }
    ))
    console.log("calling crejsonldap with users:", JSON.stringify(users))
    const crejsonldap_param = JSON.stringify({ id: ["uid"], users: users.map(attrs => ({ attrs })) })
    const response = await helpers.popen({ inText: crejsonldap_param, ...conf.crejsonldap })
    console.log("crejsonldap response:", response)
}


const cmds = { http_server, sync_users }

const cmd = process.argv[2]
if (cmds[cmd]) {
    cmds[cmd]()
} else {
    console.error(`usage: ./index.js ${Object.keys(cmds).join('|')}`)
}

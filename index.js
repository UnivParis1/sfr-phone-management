#!/usr/bin/env nodejs

const express = require('express')
const puppeteer = require('puppeteer');
const conf = require('./conf')
const helpers = require('./helpers')

require('console-stamp')(console, 'HH:MM:ss.l');


const assign_free_phoneNumber = async (wanted_user_mail, mac_address) => {
    const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
    const page = await browser.newPage();
    let chosen_phoneNumber;

    await helpers.do_and_waitForNavigation(page, 'first page', () => page.goto(conf.base_url));

    await helpers.SPA_step(page, 'login', async () => {
        await page.waitFor("#username")
        await page.type("#username", conf.admin_login)
        await page.type("#password", conf.admin_password)
    }, 'button[name=login]')
    
    await helpers.SPA_step(page, 'subscribe user', async () => {        
    }, '.block-mobile [href="?id=subscribe_user"]')

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

    await browser.close();

    return chosen_phoneNumber;
}

function start_http_server() {
    const app = express()
    
    app.get('/', (req, res) => {
        if (req.query.mac_address && req.query.wanted_user_mail) {
            assign_free_phoneNumber(req.query.wanted_user_mail, req.query.mac_address.toUpperCase()).then(chosen_phoneNumber => {
                res.send(`Numéro assigné : ${chosen_phoneNumber}`)
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
            <input name="wanted_user_mail" size="40" >
            <br><br>
            <label>Adresse MAC (sans séparateurs)</label>
            <br>
            <input name="mac_address" maxlength="12" size="12">
            <br><br>
            <input type="submit" value="Assigner un numéro de téléphone disponible">
        </form>
        </html>
        `)
    });
    app.listen(conf.http_server.port, () => console.log(`Started on port ${conf.http_server.port}!`))
}

start_http_server();

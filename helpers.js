
const click_when_visible = async (page, action_selector) => {
    console.log("waiting for elt to click", action_selector)
    await page.waitForSelector(action_selector, { visible: true });
    console.log("clicking on", action_selector);
    await page.click(action_selector)
}

const do_and_waitForNavigation = async (page, step_name, action) => {
    console.log('== starting step ' + step_name + ' =================');
    try {
        await Promise.all([
            page.waitForNavigation({ waitUntil: "networkidle2" }),
            action()
        ]);
    } catch (e) {
        console.error(e)
        throw "action on step " + step_name + " failed";
    }
}

const SPA_step = async (page, step_name, actions, action_selector) => {
    console.log('== starting step ' + step_name + ' =================');
    await actions();
    await click_when_visible(page, action_selector)
}

const add_ids_to_allow_CSS_selector = async (page, expected_id) => {
    const ids = await page.waitFor(expected_id => {
        let ids = []
        for (const e of document.querySelectorAll('.field-label')) {
            ids.push(e.parentElement.id = "SPM-" + e.innerText.replace(/\W/g, '-').replace(/-*$/, ''))
        }
        return ids.includes(expected_id) && ids.join(' ')
    }, {}, expected_id)
    console.log("added ids from .field-label:", await ids.jsonValue())
}

const select2_selector = {
    search_input: '#select2-drop .select2-search input',
    choices: '#select2-drop .select2-results > li > div',
}

const _select2_click_and_type = async (page, field_id_selector, search) => {
    console.log(field_id_selector, ": waiting for select2 to be enabled")
    await page.waitFor(field_id_selector + ' .select2-container:not(.select2-container-disabled)');
    console.log(field_id_selector, ": opening select2")
    await page.click(field_id_selector + ' a.select2-choice');
    console.log(field_id_selector, ": waiting for search input");
    await page.waitForSelector(select2_selector.search_input, { visible: true });
    console.log(field_id_selector, ": typing in search input: ", search)
    await page.type(select2_selector.search_input, search);
}

const _select2_waitFor_my_choice = async (page, field_id_selector, wanted, comparison) => {
    console.log(field_id_selector, ": waiting for profile choices for", wanted)
    return await page.waitFor((choices_selector, wanted, comparison) => (
        Array.from(document.querySelectorAll(choices_selector)).find(elt => (
            comparison === 'exact' ? elt.innerText === wanted : elt.innerText.includes(wanted)
        ))
    ), {}, select2_selector.choices, wanted, comparison)
}

const handle_select2 = async (page, field_id_selector, wanted, comparison) => {
    await _select2_click_and_type(page, field_id_selector, wanted)

    const choice = await _select2_waitFor_my_choice(page, field_id_selector, wanted, comparison)

    console.log(field_id_selector, ': our profile is in the list of choices. clicking it', wanted);
    await choice.click();
}

const handle_select2_fuzzy = async (page, field_id_selector, search, which_choice) => {
    await _select2_click_and_type(page, field_id_selector, search)

    await _select2_waitFor_my_choice(page, field_id_selector, search, 'substring')

    console.log(field_id_selector, ": getting choices for", field_id_selector, 'and search', search);
    const choices = await page.$$eval(select2_selector.choices, elts => elts.map(elt => elt.innerText));
    const wanted = which_choice(choices);
    console.log(field_id_selector, ': chosen', wanted, 'in the list of choices. Using it.');
    await page.$eval(select2_selector.search_input, elt => elt.value = ""); // clear it
    await page.type(select2_selector.search_input, wanted);

    const choice = await _select2_waitFor_my_choice(page, field_id_selector, wanted, 'substring')

    console.log(field_id_selector, ': our profile is in the list of choices. clicking it', wanted);
    await choice.click();
    return wanted
}

module.exports = {
    SPA_step,
    do_and_waitForNavigation,
    add_ids_to_allow_CSS_selector,
    handle_select2,
    handle_select2_fuzzy
}
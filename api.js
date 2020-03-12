const _ = require('lodash')
const fetch = require('node-fetch')
const { URLSearchParams } = require('url');
const helpers = require('./helpers')
const conf = require('./conf')

const get_access_token = async () => {
    const res = await fetch('https://mycollaboration.service-now.com/oauth_token.do', {
        method: 'POST',
        body: new URLSearchParams({
            grant_type: 'password',
            client_id: conf.api.client_id,
            client_secret: conf.api.client_secret,
            username: conf.admin_login,
            password: conf.admin_password,
        }),
    })
    return (await res.json()).access_token
}

const add_mac_addresses = async (access_token, users) => {
    const user_sys_id_to_supannAliasLogin = _.mapValues(_.groupBy(users, user => user.sys_id), l => l[0].u_user_id)

    const mac_addresses_ = await table_get(access_token, 'alm_hardware', 'asset_tag,display_name,u_mac_address,assigned_to' + ',install_status,substatus')
    //console.log(mac_addresses_.filter(e => e.u_mac_address && e.u_mac_address.toUpperCase() === '006CBCA9C631'))

    const hardware__install_status = { in_use: '1' }
    const user_id_and_mac_address = mac_addresses_.filter(e => (
        e.u_mac_address && e.install_status === hardware__install_status.in_use
    )).map(e => (
        [user_sys_id_to_supannAliasLogin[e.assigned_to.value], format_mac_address(e.u_mac_address)]
    )).filter(both => both[0])
    check_user_id_and_mac_address(user_id_and_mac_address)
    const user_id_to_mac_address = _.fromPairs(user_id_and_mac_address)

    users.forEach(user => user.mac_address = user_id_to_mac_address[user.u_user_id])
}

const raw_api_get = async (access_token, url) => {
    const headers = {
        Authorization: 'Bearer ' + access_token,
    }
    const res = await fetch(url, { headers })
    return (await res.json()).result
}

const table_get = async (access_token, table_name, fields) => {
    const url = `https://mycollaboration.service-now.com/api/now/table/${table_name}?sysparm_limit=9999&sysparm_fields=${fields}`
    return await raw_api_get(access_token, url)
}

const format_mac_address = (s) => (
    s.replace(/:/g, '').replace(/(..)(?!$)/g, "$1:")
)

const fromPairs_grouped = (l) => (
    _.mapValues(_.groupBy(l, e => e[0]), l => l.map(e => e[1]))
)

const log_error_if_not_empty = (msg, o) => {
    if (!_.isEmpty(o)) console.error(msg, JSON.stringify(o))

}

const log_error_grouped_if_many = (msg, grouped) => {
    const has_many = _.pickBy(grouped, l => l.length > 1);
    log_error_if_not_empty(msg, has_many)
}

const check_user_id_and_mac_address = (user_id_and_mac_address) => {
    log_error_grouped_if_many('shared mac', fromPairs_grouped(user_id_and_mac_address.map(([id, mac]) => [mac, id])))
    log_error_grouped_if_many('multiple mac', fromPairs_grouped(user_id_and_mac_address))
}

const sync_users = async () => {
    const access_token = await get_access_token()

    const users_ = await table_get(access_token, 'sys_user', 'sys_id,u_user_id,u_external_number,u_profile_asset,u_directory_type')
    const users = users_.filter(user => (
        user.u_external_number && user.u_directory_type === "company directory"
    ))

    await add_mac_addresses(access_token, users)

    log_error_if_not_empty('profile asset but no hardware', users.filter(user => user.u_profile_asset && !user.mac_address).map(user => _.pick(user, 'u_user_id', 'sys_id')))

    let in_ = users.map(user => ({
        type: "toip",
        id: { supannAliasLogin: user.u_user_id },
        mods: {
            telephoneNumber: { [user.u_profile_asset && user.mac_address ? 'set': 'unset']: user.u_external_number }, 
            "supannRefId.{TOIP:MAC}": { "set": user.mac_address || null },
        },
    }))

    console.log("calling jsonattrmod with users:", JSON.stringify(in_.map(one => one.id.supannAliasLogin)))
    const inText = JSON.stringify(in_)
    //console.log(inText)
    try {
        const response = await helpers.popen({ inText, ...conf.jsonattrmod })
        JSON.parse(response).objects.filter(e => e.action !== 'NONE').forEach(e => console.warn(JSON.stringify(e)))
    } catch (e) {
        try {
            const resp = JSON.parse(e)
            console.error(resp.err || resp.warn)
            resp.objects.filter(e => e.err || e.warn).forEach(e => console.error(JSON.stringify(e)))
        } catch (_) {
            console.error(e)
        }
    }

}

module.exports = {
    sync_users,
}
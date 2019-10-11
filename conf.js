module.exports = {
    base_url: 'https://mycollaboration.service-now.com',

    admin_login: "Foo.Bar@univ.fr",
    admin_password: "xxx",

    http_server: {
        port: 8080,
    },

    crejsonldap: {
        cmd: 'crejsonldap',
        params: [],
    },

    dumps_on_error_directory: '/webhome/sfr-phone-m/dumps-on-error',
    download_directory: '/webhome/sfr-phone-m/downloads',
};

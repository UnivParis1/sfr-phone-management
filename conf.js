module.exports = {
    base_url: 'https://mycollaboration.service-now.com',

    admin_login: "Foo.Bar@univ.fr",
    admin_password: "xxx",

    api: {
        client_id: '...',
        client_secret: '...',
    },

    http_server: {
        port: 8080,
    },

    jsonattrmod: {
        cmd: 'jsonattrmod',
        params: [],
    },

    dumps_on_error_directory: '/webhome/sfr-phone-m/dumps-on-error',
    download_directory: '/webhome/sfr-phone-m/downloads',
};

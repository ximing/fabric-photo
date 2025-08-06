module.exports = function(api) {
    api.cache(false);
    return {
        presets: [
            [
                '@babel/preset-env',
                {
                    targets: {
                        browsers: ['safari >= 9', 'android >= 4.0']
                    }
                }
            ],
            '@babel/preset-react'
        ],
        ignore: [],
        comments: false,
        plugins: [
            [
                '@babel/plugin-proposal-decorators',
                {
                    legacy: true
                }
            ],
            '@babel/plugin-syntax-dynamic-import',
            '@babel/plugin-syntax-import-meta',
            '@babel/plugin-transform-class-properties'
        ]
    };
};

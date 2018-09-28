'use strict';


const {
    resolve
} = require('path');
const webpack = require('webpack');
const path = require('path');
const c9 = !!process.env.PORT;
const c9Host = process.env.HOST || 'http://fabric-photo-yeanzhi.c9users.io/';
module.exports = {
    entry: {
        'index': [
            'react-hot-loader/patch',
            `webpack-dev-server/client?${c9 ? c9Host : 'http://127.0.0.1:9876'}`,
            'webpack/hot/only-dev-server',
            './demo/index.js'
        ]
    },
    output: {
        filename: '[name].js',
        sourceMapFilename: '[file].map',
        path: resolve(__dirname, 'dist'),
        publicPath: '/dist'
    },
    devtool: 'cheap-module-eval-source-map',

    devServer: {
        contentBase: [path.join(__dirname, 'html'), path.join(__dirname, 'dist')],
        compress: true,
        port: parseInt(process.env.PORT,10) || 9876,
        host: '0.0.0.0',
        hot: true,
        inline: true,
        publicPath: '/dist/',
        historyApiFallback: {
            rewrites: [{
                from: /^\/$/,
                to: '/html/index.html'
            }]
        },
        watchContentBase: true
    },
    performance: {
        hints: false
    },
    module: {
        rules: [{
            test: /\.js$/,
            use: [{
                loader: 'babel-loader',
                options: {
                    'presets': [
                        ['es2015', {
                            'modules': false
                        }], 'stage-0', 'react'
                    ],
                    'env': {},
                    'ignore': [
                        'node_modules/**',
                        'dist'
                    ],
                    'plugins': [
                        'react-hot-loader/babel',
                        'transform-decorators-legacy'
                    ]
                }
            }],
            exclude: [/node_modules/]
        }, {
            test: /\.css$/,
            use: [
                'style-loader',
                'css-loader',
                'postcss-loader'
            ]
        }, {
            test: /\.scss$/,
            use: [
                'style-loader',
                'css-loader',
                'postcss-loader',
                'sass-loader'
            ]
        }, {
            test: /\.(png|jpg|jpeg|gif|woff|svg|eot|ttf|woff2)$/i,
            use: ['url-loader']
        }]
    },
    externals: {
        jquery: 'jQuery',
        lodash: '_'
    },
    plugins: [
        new webpack.HotModuleReplacementPlugin(),
        new webpack.NamedModulesPlugin(),
        new webpack.DllReferencePlugin({
            context: __dirname,
            manifest: require('./dist/vendor-manifest.json')
        })
    ]
};

'use strict';


const {
    resolve
} = require('path');
const webpack = require('webpack');
const path = require('path');

module.exports = {
    entry: {
        'index': [
            'react-hot-loader/patch',
            'webpack-dev-server/client?https://rxjs-yeanzhi.c9users.io',
            'webpack/hot/only-dev-server',
            './client/index.js'
        ]
    },
    output: {
        filename: 'index.js',
        path: resolve(__dirname, 'dist'),
        publicPath: '/'
    },
    devtool: 'cheap-eval-source-map',

    devServer: {
        contentBase: [path.join(__dirname, 'views'),path.join(__dirname, 'dist')],
        compress: false,
        port: 9876,
        host: '0.0.0.0',
        hot: true,
        inline: true,
        publicPath: '/',
        historyApiFallback: {
            rewrites: [{
                from: /^\/$/,
                to: '/index.html'
            }, {
                from: /./,
                to: '/404.html'
            }]
        },
        watchContentBase:true
    },
    performance: {
        hints: false
    },
    module: {
        loaders: [
            {
                test: /\.scss$/,
                loader:[
                    {
                        loader:'style-loader'
                    },
                    {
                        loader: 'css-loader',
                        options: {
                            modules: true
                        }
                    },
                    {
                        loader: 'postcss-loader',
                        options: {
                            plugins: [
                                require('postcss-clearfix'),
                                require('autoprefixer'),
                                require('postcss-position'),
                                require('postcss-size')
                            ]
                        }
                    },
                    {loader: 'sass-loader'}
                ]
            },
            {
                test: /\.css$/,
                loader: ['style-loader','css-loader']
            },
            {
                test: /\.(png|jpg|jpeg|gif|woff|svg|eot|ttf|woff2)$/i,
                loader: [{
                    loader: 'url-loader'
                }]
            }, {
                test: /\.js?$/,
                exclude: /node_modules/,
                loader: ['react-hot-loader','babel-loader']
            }
        ]

    },

    plugins: [
        new webpack.HotModuleReplacementPlugin(),
        // enable HMR globally

        new webpack.NamedModulesPlugin(),
        // prints more readable module names in the browser console on HMR updates
        new webpack.DllReferencePlugin({
            context: __dirname,
            /**
             * 在这里引入 manifest 文件
             */
            manifest: require('./dist/vendor-manifest.json')
        })
        // new webpack.optimize.CommonsChunkPlugin({
        //   name: 'common'
        // })
    ]
};

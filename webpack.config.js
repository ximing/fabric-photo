const { resolve } = require('path');
const path = require('path');
const webpack = require('webpack');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const { HotModuleReplacementPlugin } = webpack;
const { DefinePlugin } = webpack;

module.exports = {
    mode: 'development',
    entry: {
        index: ['./demo/index.js']
    },
    output: {
        filename: '[name].js',
        sourceMapFilename: '[file].map',
        path: resolve(__dirname, 'public'),
        publicPath: '/public',
        clean: true
    },
    devtool: 'eval-cheap-module-source-map',

    devServer: {
        static: [
            path.join(__dirname, 'html'),
            path.join(__dirname, 'public'),
            path.join(__dirname, 'demo')
        ],
        compress: true,
        port: parseInt(process.env.PORT, 10) || 9876,
        host: '0.0.0.0',
        hot: true,
        historyApiFallback: {
            rewrites: [
                {
                    from: /^\/$/,
                    to: '/html/index.html'
                }
            ]
        }
    },
    performance: {
        hints: false
    },
    module: {
        rules: [
            {
                test: /\.(js|ts)$/,
                use: [
                    {
                        loader: 'babel-loader'
                    }
                ],
                exclude: [/node_modules/]
            },
            {
                test: /\.css$/,
                use: ['style-loader', 'css-loader', 'postcss-loader']
            },
            {
                test: /\.scss$/,
                use: ['style-loader', 'css-loader', 'postcss-loader', 'sass-loader']
            },
            {
                test: /\.(png|jpg|jpeg|gif|woff|svg|eot|ttf|woff2)$/i,
                type: 'asset/resource'
            }
        ]
    },
    externals: {
        jquery: 'jQuery',
        lodash: '_'
    },
    resolve: {
        extensions: ['.ts', '.js', '.json'],
        fallback: {
            url: false,
            http: false,
            https: false
        }
    },
    plugins: [
        new HotModuleReplacementPlugin(),
        new HtmlWebpackPlugin({
            template: './html/index.html'
        }),
        new DefinePlugin({
            'process.env.NODE_ENV': JSON.stringify('development')
        })
    ]
};

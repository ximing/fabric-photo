const { resolve } = require('path');
const webpack = require('webpack');
const path = require('path');

module.exports = {
    entry: {
        index: ['./demo/index.js']
    },
    output: {
        filename: '[name].js',
        sourceMapFilename: '[file].map',
        path: resolve(__dirname, 'public'),
        publicPath: '/public'
    },
    devtool: 'cheap-module-eval-source-map',

    devServer: {
        contentBase: [path.join(__dirname, 'html'), path.join(__dirname, 'public')],
        compress: true,
        port: parseInt(process.env.PORT, 10) || 9876,
        host: '0.0.0.0',
        hot: true,
        inline: true,
        publicPath: '/dist/',
        historyApiFallback: {
            rewrites: [
                {
                    from: /^\/$/,
                    to: '/html/index.html'
                }
            ]
        },
        watchContentBase: true
    },
    performance: {
        hints: false
    },
    module: {
        rules: [
            {
                test: /\.js$/,
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
                use: ['url-loader']
            }
        ]
    },
    externals: {
        jquery: 'jQuery',
        lodash: '_'
    },
    plugins: [new webpack.HotModuleReplacementPlugin()]
};

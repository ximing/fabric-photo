/**
 * Created by yeanzhi on 17/1/13.
 */
'use strict';
module.exports = {
    plugins: [
        require('postcss-clearfix')(),
        require('autoprefixer')(),
        require('postcss-position')(),
        require('postcss-size')()
    ]
};

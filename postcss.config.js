/**
 * Created by yeanzhi on 17/1/13.
 */
module.exports = {
    plugins: [
        require('postcss-flexbugs-fixes'),
        require('postcss-preset-env')({
            autoprefixer: {
                flexbox: 'no-2009'
            },
            stage: 3
        }),
        require('postcss-clearfix')(),
        require('postcss-position')(),
        require('postcss-size')()
    ]
};

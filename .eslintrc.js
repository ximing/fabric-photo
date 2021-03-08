module.exports = {
    extends: ['airbnb', 'prettier'],
    parser: 'babel-eslint',
    plugins: ['jest'],
    env: {
        'jest/globals': true
    },
    globals: {
        window: true,
        Blob: true,
        atob: true,
        document: true
    },
    settings: {},
    rules: {
        'max-lines': ['error', { max: 600, skipComments: true, skipBlankLines: true }],
        'import/no-extraneous-dependencies': 'off',
        'react/prop-types': 'off',
        'jest/no-disabled-tests': 'warn',
        'jest/no-focused-tests': 'error',
        'jest/no-identical-title': 'error',
        'jest/prefer-to-have-length': 'warn',
        'jest/valid-expect': 'error',
        'react/react-in-jsx-scope': 'off',
        'react/jsx-filename-extension': 'off',
        'react/jsx-no-undef': 'off',
        'react/jsx-indent': 'off',
        'react/no-access-state-in-setstate': 'off',
        'no-shadow': 'off',
        calemcase: 'off',
        'class-methods-use-this': 'off',
        'react/destructuring-assignment': 'off',
        'consistent-return': 'off',
        'array-callback-return': 'off',
        'import/named': 'off',
        'import/prefer-default-export': 1,
        'one-var': 'off',
        'no-underscore-dangle': 'off',
        'no-plusplus': 'off',
        camelcase: 1,
        'no-console': 'off',
        'no-empty': 1,
        'no-unused-expressions': 1,
        'no-multi-assign': 'off',
        'import/first': 1,
        'prefer-promise-reject-errors': 1,
        'import/extensions': 'off',
        'prefer-const': 1,
        'no-bitwise': 'off',
        'no-restricted-syntax': 1,
        'no-param-reassign': 1,
        'no-nested-ternary': 1,
        'no-control-regex': 'off',
        'react/no-unknown-property': 'off',
        'react/jsx-one-expression-per-line': 'off',
        'react/button-has-type': 'off',
        'spaced-comment': 'off',
        'react/sort-comp': 'off'
    }
};
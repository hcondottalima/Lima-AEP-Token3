module.exports = {
    root: true,
    env: {
        browser: true,
        node: true,
        es2021: true,
    },
    extends: ['eslint:recommended'],
    parserOptions: {
        ecmaVersion: 2021,
        sourceType: 'module',
    },
    rules: {
        // project-specific rules can be added later
        'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
        'no-console': 'off'
    }
};

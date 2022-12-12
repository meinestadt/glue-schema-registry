module.exports = {
  root: true,
  extends: ['prettier'],
  parserOptions: {
    ecmaVersion: 2019,
    sourceType: 'module',
    ecmaFeatures: {
      jsx: false,
    },
  },
  env: {
    node: true,
  },
  overrides: [
    {
      files: ['**/*.ts'],
      extends: ['plugin:@typescript-eslint/recommended'],
      rules: {
        'no-console': 'error',
        '@typescript-eslint/no-use-before-define': 'error',
        '@typescript-eslint/no-explicit-any': 'error',
        '@typescript-eslint/explicit-function-return-type': 'off',
      },
    },
  ],
}

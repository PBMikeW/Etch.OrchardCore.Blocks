const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const path = require('path');
const TerserPlugin = require('terser-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');

module.exports = function webpackConfig(env, argv) {
    const isProduction = argv.mode === 'production';

    return [
        {
            mode: argv.mode || 'development',
            entry: {
                editorjs: './Assets/Editor.js/js/index',
            },
            output: {
                path: path.resolve(__dirname, './wwwroot/Scripts/'),
                filename: '[name]/admin.js',
            },
            devtool: isProduction ? false : 'source-map',
            module: {
                rules: [
                    {
                        test: /\.js$/,
                        exclude: /node_modules/,
                        use: { loader: 'babel-loader' },
                    },
                    {
                        test: /\.s?css$/,
                        use: [
                            isProduction
                                ? MiniCssExtractPlugin.loader
                                : 'style-loader',
                            'css-loader',
                            'sass-loader',
                        ],
                    },
                ],
            },
            resolve: {
                extensions: ['.js', '.jsx'],
            },
            externals: {
                bootstrap: 'bootstrap',
                jquery: 'jQuery',
            },
            plugins: [
                ...(isProduction
                    ? [
                          new MiniCssExtractPlugin({
                              filename: '../Styles/[name]/admin.css',
                          }),
                      ]
                    : []),
            ],
            optimization: {
                minimize: isProduction,
                ...(isProduction && {
                    minimizer: [
                        new TerserPlugin({
                            terserOptions: {
                                compress: {
                                    drop_console: true,
                                    drop_debugger: true,
                                },
                                output: { comments: false },
                            },
                            extractComments: false,
                        }),
                    ],
                }),
            },
            performance: {
                hints: isProduction ? 'warning' : false,
                maxEntrypointSize: 512000,
                maxAssetSize: 512000,
            },
        },
    ];
};

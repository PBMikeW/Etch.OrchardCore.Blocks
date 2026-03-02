const path = require('path');
const TerserPlugin = require('terser-webpack-plugin');

module.exports = function webpackConfig(env, argv) {
    const isProduction = argv.mode === 'production';

    const moduleRules = {
        rules: [
            {
                test: /\.js$/,
                exclude: /node_modules/,
                use: {
                    loader: 'babel-loader',
                },
            },
            {
                test: /\.s?css$/,
                use: ['style-loader', 'css-loader', 'sass-loader'],
            },
        ],
    };

    return [
        {
            mode: argv.mode || 'development',
            entry: {
                editorjs: './Assets/Editor.js/js/index',
                styles: './Assets/Editor.js/css/index.scss',
            },
            output: {
                path: path.resolve(__dirname, './wwwroot/Scripts/'),
                filename: '[name]/admin.js',
            },
            devtool: isProduction ? false : 'source-map',
            module: moduleRules,
            resolve: {
                extensions: ['.js', '.jsx'],
            },
            externals: {
                bootstrap: 'bootstrap',
                jquery: 'jQuery',
            },
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
                                output: {
                                    comments: false,
                                },
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

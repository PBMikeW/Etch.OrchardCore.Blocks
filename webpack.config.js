const path = require('path');

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
      use: ['style-loader', 'css-loader', 'sass-loader']
    },
  ]
};

module.exports = [
  {
    mode: 'development',
    entry: {
      editorjs: './Assets/Editor.js/js/index',
      styles: './Assets/Editor.js/css/index.scss',
    },
    output: {
      path: path.resolve(__dirname, './wwwroot/Scripts/'),
      filename: '[name]/admin.js',
    },
    module: moduleRules,
    resolve: {
      extensions: [".js", ".jsx"]
    },
    externals: {
      bootstrap: 'bootstrap',
      jquery: 'jQuery',
    },
    performance: {
      hints: "warning"
    }
  }
];

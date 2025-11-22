const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const JavaScriptObfuscator = require('webpack-obfuscator');

module.exports = (env, argv) => {
  const isProduction = argv.mode === 'production';
  
  return {
    mode: isProduction ? 'production' : 'development',
    entry: {
      // Main frontend files
      home: './frontend-src/home.js',
      preview: './frontend-src/preview.js',
      admin: './frontend-src/admin.js'
    },
    output: {
      path: path.resolve(__dirname, 'frontend-build'),
      filename: isProduction ? '[name].[contenthash].min.js' : '[name].js',
      clean: true,
      publicPath: '/build/'
    },
    optimization: {
      minimize: isProduction,
      splitChunks: {
        chunks: 'all',
        cacheGroups: {
          vendor: {
            test: /[\\/]node_modules[\\/]/,
            name: 'vendors',
            chunks: 'all',
          },
        },
      },
    },
    plugins: [
      // HTML processing for each page
      new HtmlWebpackPlugin({
        template: './frontend/index.html',
        filename: 'index.html',
        chunks: ['home'],
        minify: isProduction ? {
          removeComments: true,
          collapseWhitespace: true,
          removeRedundantAttributes: true,
          useShortDoctype: true,
          removeEmptyAttributes: true,
          removeStyleLinkTypeAttributes: true,
          keepClosingSlash: true,
          minifyJS: true,
          minifyCSS: true,
          minifyURLs: true,
        } : false
      }),
      new HtmlWebpackPlugin({
        template: './frontend/preview.html',
        filename: 'preview.html',
        chunks: ['preview'],
        minify: isProduction ? {
          removeComments: true,
          collapseWhitespace: true,
          removeRedundantAttributes: true,
          useShortDoctype: true,
          removeEmptyAttributes: true,
          removeStyleLinkTypeAttributes: true,
          keepClosingSlash: true,
          minifyJS: true,
          minifyCSS: true,
          minifyURLs: true,
        } : false
      }),
      new HtmlWebpackPlugin({
        template: './frontend/admin.html',
        filename: 'admin.html',
        chunks: ['admin'],
        minify: isProduction ? {
          removeComments: true,
          collapseWhitespace: true,
          removeRedundantAttributes: true,
          useShortDoctype: true,
          removeEmptyAttributes: true,
          removeStyleLinkTypeAttributes: true,
          keepClosingSlash: true,
          minifyJS: true,
          minifyCSS: true,
          minifyURLs: true,
        } : false
      }),
      
      // JavaScript obfuscation for production
      ...(isProduction ? [
        new JavaScriptObfuscator({
          rotateStringArray: true,
          stringArray: true,
          stringArrayThreshold: 0.75,
          unicodeEscapeSequence: false,
          identifierNamesGenerator: 'hexadecimal',
          renameGlobals: false,
          transformObjectKeys: true,
          disableConsoleOutput: true,
          debugProtection: true,
          debugProtectionInterval: 2000,
          domainLock: [],
          exclude: ['vendors*.js'] // Don't obfuscate vendor libraries
        }, ['*.js'])
      ] : [])
    ],
    module: {
      rules: [
        {
          test: /\.js$/,
          exclude: /node_modules/,
          use: {
            loader: 'babel-loader',
            options: {
              presets: ['@babel/preset-env']
            }
          }
        },
        {
          test: /\.css$/i,
          use: ['style-loader', 'css-loader'],
        },
        {
          test: /\.(png|svg|jpg|jpeg|gif)$/i,
          type: 'asset/resource',
        },
      ],
    },
    resolve: {
      extensions: ['.js', '.json'],
    },
    devtool: isProduction ? false : 'source-map',
  };
};
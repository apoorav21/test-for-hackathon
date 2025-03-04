const path = require('path');
const webpack = require('webpack');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const TerserPlugin = require('terser-webpack-plugin');

module.exports = {
  mode: 'production',
  entry: './src/js/index.js',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'js/[name].[contenthash].js',
    clean: true,
    publicPath: '/'
  },
  optimization: {
    minimize: true,
    minimizer: [new TerserPlugin()],
    splitChunks: {
      chunks: 'all',
      name: 'vendors',
      filename: 'js/[name].[contenthash].js'
    }
  },
  resolve: {
    extensions: ['.js', '.jsx'],
    fallback: {
      "fs": false,
      "net": false,
      "tls": false,
      "child_process": false,
      "path": require.resolve("path-browserify"),
      "stream": require.resolve("stream-browserify"),
      "crypto": require.resolve("crypto-browserify"),
      "buffer": require.resolve("buffer/"),
      "util": require.resolve("util/"),
      "assert": require.resolve("assert/"),
      "http": require.resolve("stream-http"),
      "https": require.resolve("https-browserify"),
      "os": require.resolve("os-browserify/browser"),
      "url": require.resolve("url/"),
      "querystring": require.resolve("querystring-es3")
    },
    alias: {
      'node:util': 'util',
      'node:events': 'events',
      'node:process': 'process/browser',
      'node:buffer': 'buffer',
      'node:stream': 'stream-browserify',
      'node:crypto': 'crypto-browserify',
      'node:path': 'path-browserify',
      'node:assert': 'assert',
      'node:http': 'stream-http',
      'node:https': 'https-browserify',
      'node:os': 'os-browserify/browser',
      'node:url': 'url',
      'node:querystring': 'querystring-es3'
    }
  },
  stats: {
    children: true,
    errorDetails: true,
    warnings: true
  },
  plugins: [
    new webpack.ProvidePlugin({
      process: 'process/browser',
      Buffer: ['buffer', 'Buffer'],
      util: 'util'
    }),
    new webpack.DefinePlugin({
      'process.env.GOOGLE_APPLICATION_CREDENTIALS': JSON.stringify(process.env.GOOGLE_APPLICATION_CREDENTIALS)
    }),
    new MiniCssExtractPlugin({
      filename: 'css/[name].[contenthash].css'
    }),
    new HtmlWebpackPlugin({
      title: 'React VideoCall',
      filename: 'index.html',
      template: 'src/html/index.html'
    })
  ],
  module: {
    rules: [
      {
        test: /\.js$/,
        exclude: /(node_modules|bower_components)/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: ['@babel/preset-react', '@babel/preset-env']
          }
        }
      },
      {
        test: require.resolve('webrtc-adapter'),
        use: 'expose-loader'
      },
      {
        test: /\.scss$/,
        use: [MiniCssExtractPlugin.loader, 'css-loader', 'sass-loader']
      },
      {
        test: /\.(png|woff|woff2|eot|ttf|svg)$/,
        use: [
          {
            loader: 'file-loader',
            options: {
              name: '[name].[ext]',
              outputPath: 'assets'
            }
          }
        ]
      }
    ]
  }
};

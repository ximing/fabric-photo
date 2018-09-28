/**
 * Created by yeanzhi on 16/12/1.
 */
'use strict';
import 'babel-polyfill';
import './scss/index.scss';
import React from 'react';
import ReactDOM from 'react-dom';
import Main from './main';
ReactDOM.render(
    <div>
        <Main />
    </div>,
    document.getElementById('demo_container')
);
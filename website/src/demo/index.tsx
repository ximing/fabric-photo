import '../scss/index.scss';
import React from 'react';
import ReactDOM from 'react-dom';
import Main from './main';

const container = document.getElementById('demo_container');

if (container) {
    ReactDOM.render(<Main />, container);
}

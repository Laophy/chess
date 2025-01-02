const concurrently = require("concurrently");

concurrently(
  [
    {
      command: "set REACT_APP_DEV=true && react-scripts start",
      name: "renderer",
      prefixColor: "blue",
    },
    {
      command: "wait-on tcp:3000 && electron public/electron.js",
      name: "main",
      prefixColor: "green",
    },
  ],
  {
    prefix: "name",
    killOthers: ["failure", "success"],
  }
);

var add = require("./util");

 //   @handler   

module.exports = (asked,answer) => {
    answer.write( add("from ", "main") );
}
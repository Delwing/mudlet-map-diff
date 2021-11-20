const createDiff = require("./index")

createDiff("maps/v1.dat", "maps/v2.dat", "diff").then(diff => console.log(diff))
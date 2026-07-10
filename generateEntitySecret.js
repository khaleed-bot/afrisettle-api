const crypto = require("crypto");

const entitySecret = crypto.randomBytes(32).toString("hex");

console.log("\nEntity Secret:\n");
console.log(entitySecret);
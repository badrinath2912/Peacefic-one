const dns = require("node:dns").promises;

(async () => {
  try {
    console.log("Resolving SRV...");
    const records = await dns.resolveSrv("_mongodb._tcp.cluster0.pweesrr.mongodb.net");
    console.log(records);
  } catch (err) {
    console.error(err);
  }
})();
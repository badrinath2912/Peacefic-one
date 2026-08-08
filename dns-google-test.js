const dns = require("dns");

dns.setServers(["8.8.8.8", "8.8.4.4"]);

console.log("Using:", dns.getServers());

dns.resolveSrv(
  "_mongodb._tcp.cluster0.pweesrr.mongodb.net",
  (err, records) => {
    if (err) {
      console.error(err);
    } else {
      console.log(records);
    }
  }
);
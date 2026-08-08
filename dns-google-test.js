const dns = require("node:dns");

dns.setServers(["8.8.8.8", "8.8.4.4"]);

console.log("Using:", dns.getServers());

dns.resolveSrv(
  "_mongodb._tcp.cluster0.pweesrr.mongodb.net",
  (err, records) => {
    if (err) {
      console.error("DNS SRV resolution failed:");
      console.error(err);
      process.exitCode = 1;
      return;
    }

    console.log("SRV records:");
    console.log(records);
  }
);

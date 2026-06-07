// Minimal test framework: a `suite` collects named tests; each test gets an
// assertion object. Failures throw with a descriptive message; the runner
// catches them and tallies pass/fail. No external dependencies.

function makeAssert() {
  const a = {
    count: 0,
    ok(cond, msg) {
      this.count++;
      if (!cond) throw new Error("assert.ok failed: " + (msg || "(no message)"));
    },
    equal(actual, expected, msg) {
      this.count++;
      if (actual !== expected) {
        throw new Error(
          `assert.equal failed: ${msg || ""} -> expected ${JSON.stringify(
            expected
          )}, got ${JSON.stringify(actual)}`
        );
      }
    },
    // For floats: |actual - expected| <= tol.
    close(actual, expected, tol, msg) {
      this.count++;
      if (Math.abs(actual - expected) > tol) {
        throw new Error(
          `assert.close failed: ${msg || ""} -> expected ~${expected} (±${tol}), got ${actual}`
        );
      }
    },
    lessThan(actual, bound, msg) {
      this.count++;
      if (!(actual < bound)) {
        throw new Error(
          `assert.lessThan failed: ${msg || ""} -> expected ${actual} < ${bound}`
        );
      }
    },
    greaterThan(actual, bound, msg) {
      this.count++;
      if (!(actual > bound)) {
        throw new Error(
          `assert.greaterThan failed: ${msg || ""} -> expected ${actual} > ${bound}`
        );
      }
    },
  };
  return a;
}

// A suite is just an ordered list of { name, fn }. fn receives (assert).
function suite() {
  const tests = [];
  return {
    test(name, fn) {
      tests.push({ name, fn });
    },
    tests,
  };
}

module.exports = { makeAssert, suite };

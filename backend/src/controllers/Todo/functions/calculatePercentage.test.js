/* A százalék-számítás tesztjei — tiszta függvény, adatbázis nélkül vizsgálható.
   A kártyán megjelenő "hány százalék kész" ebből jön. */
const test = require("node:test");
const assert = require("node:assert");
const calculatePercentage = require("./calculatePercentage");

const kereses = (tasks) => calculatePercentage({body: {tasks}});

test("üres listánál 100% (nincs mit elvégezni)", () => {
    assert.strictEqual(kereses({}), 100);
});

test("egy elem sincs kész: 0%", () => {
    assert.strictEqual(kereses({
        0: {id: "0", content: "tej", done: false},
        1: {id: "1", content: "kenyér", done: false},
    }), 0);
});

test("fele kész: 50%", () => {
    assert.strictEqual(kereses({
        0: {id: "0", content: "tej", done: true},
        1: {id: "1", content: "kenyér", done: false},
    }), 50);
});

test("minden kész: 100%", () => {
    assert.strictEqual(kereses({
        0: {id: "0", content: "tej", done: true},
        1: {id: "1", content: "kenyér", done: true},
    }), 100);
});

test("kerekít: háromból egy kész = 33%", () => {
    assert.strictEqual(kereses({
        0: {done: true}, 1: {done: false}, 2: {done: false},
    }), 33);
});

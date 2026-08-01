"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var random_1 = require("../../engine/core/random");
var r = new random_1.Random(999999);
console.log('10 numeri casuali da 0 a 100');
for (var i = 0; i < 10; i++) {
    console.log(r.stream('test').int(0, 100));
}
console.log('prende due elementi a caso da una lista');
console.log(r.stream('test').pick(['pane', 'latte', 'caffè', 'vino', 'pasta']));
console.log(r.stream('test').pick(['pane', 'latte', 'caffè', 'vino', 'pasta']));
console.log('10 lanci di 2D6');
var sum = 0;
for (var i = 0; i < 10; i++) {
    var roll = r.stream('test').diceRoll(6, 2);
    sum += roll;
    console.log(roll);
}
console.log("average: ".concat(sum / 10));

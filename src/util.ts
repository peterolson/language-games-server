import * as getRandomValues from "get-random-values";

export function shuffle<T>(array: T[]): T[] {
  let currentIndex = array.length,
    temporaryValue,
    randomIndex;

  // While there remain elements to shuffle...
  while (0 !== currentIndex) {
    // Pick a remaining element...
    randomIndex = Math.floor(Math.random() * currentIndex);
    currentIndex -= 1;

    // And swap it with the current element.
    temporaryValue = array[currentIndex];
    array[currentIndex] = array[randomIndex];
    array[randomIndex] = temporaryValue;
  }

  return array;
}

export function guid() {
  return (String([1e7]) + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, (c) =>
    (+c ^ (getRandomValues(new Uint8Array(1))[0] & (15 >> (+c / 4)))).toString(
      16
    )
  );
}

const firstSymbol = "0123456789ABCEFGHJKLMNPQRSTUWXYZ";
const symbols = "0123456789ABCEFGHJKLMNPQRSTUVWXYZ";
export function shortCode(useVideo: boolean) {
  let code = firstSymbol[Math.floor(Math.random() * firstSymbol.length)];
  if (useVideo) {
    code = "V";
  }
  for (let i = 0; i < 5; i++) {
    code += symbols[Math.floor(Math.random() * symbols.length)];
  }
  return code;
}

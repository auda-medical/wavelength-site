// 1.0.14 browser checks: choose an annotation colour the way a person does, through the colour picker (the square
// opens a spectrum; one tap picks a colour; Done closes it). 1.0.12 and 1.0.13 had four fixed swatches instead.
// Each name is a spot on the spectrum (hue, lightness) whose colour the checks recognise by its channels.
export const COLOUR_AT = { cyan: [190, 50], red: [0, 50], yellow: [52, 55], green: [125, 45], blue: [222, 52], white: 'grey-left', black: 'grey-right' };

export async function setColour(page, name) {
  const spot = COLOUR_AT[name];
  if (!spot) throw new Error('no spectrum spot for ' + name);
  await page.click('.editor [data-colpick]');
  await page.waitForSelector('.editor .ed-pop:not([hidden]) [data-spec]');
  const grey = typeof spot === 'string';
  const b = await page.evaluate((g) => { const r = document.querySelector(g ? '.editor [data-grey]' : '.editor [data-spec]').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; }, grey);
  const x = grey ? (spot === 'grey-left' ? b.x + 2 : b.x + b.w - 2) : b.x + b.w * spot[0] / 360;
  const y = grey ? b.y + b.h / 2 : b.y + b.h * (92 - spot[1]) / 74;
  await page.mouse.click(x, y);
  await page.click('.editor .ed-pop [data-x]');
  await page.waitForSelector('.editor .ed-pop', { state: 'hidden' });
}

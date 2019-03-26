
function JSONparse(str) {
  try {
    str = str.replace(/: *\./g, ':0.') //Handwritten decimals (corrected refill amounts) may not have required leading 0 so add it here to avoid JSON syntax error
    str = str.replace(/: *,/g, ':"",') //If user deletes a value altogther assume it is an empty string to keep the JSON valid
    return JSON.parse(str)
  } catch (e) {
    debugEmail('JSON.parse() error', vals[i], e)
    return {error:'json parse failed', value:str}
  }
}

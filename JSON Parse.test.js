const JSONparse = require('./JSON Parse').JSONparse;

test('JSONparse', () => {
    const debugEmail = jest.fn();
    global.debugEmail = debugEmail;

    expect(JSONparse('{}')).toStrictEqual({});
    expect(JSONparse('{"a": .6}')).toStrictEqual({a: 0.6});
    expect(JSONparse('{"a": , "b": 1}')).toStrictEqual({a: "", b: 1});
    expect(JSONparse('{"a": $1}')).toStrictEqual({a: 1});

    const badInput = '{"a": }';
    expect(JSONparse(badInput)).toStrictEqual({error: "json parse failed", value: badInput});
    expect(debugEmail).toBeCalled();
});

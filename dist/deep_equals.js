export function deep_equal(x, y) {
    if (x === y) {
        return true;
    }
    else if ((typeof x == "object" && x != null) && (typeof y == "object" && y != null)) {
        if (Object.keys(x).length != Object.keys(y).length) {
            return false;
        }
        for (let prop in x) {
            if (y.hasOwnProperty(prop)) {
                if (!deep_equal(x[prop], y[prop])) {
                    return false;
                }
                ;
            }
            else {
                return false;
            }
        }
        return true;
    }
    else {
        return false;
    }
    ;
}
//# sourceMappingURL=deep_equals.js.map
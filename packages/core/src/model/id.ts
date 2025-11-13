let counter = 0;

const randomSuffix = (): string => {
    return Math.random().toString(36).slice(2, 8).padEnd(6, '0');
};

export function createId(): string {
    counter += 1;
    return `fp_${counter.toString(36)}_${randomSuffix()}`;
}

export function resolveIntent(input) {
    if (input.left && !input.right) {
        return { direction: 'backward', jump: input.jumpPressed };
    }
    if (input.right && !input.left) {
        return { direction: 'forward', jump: input.jumpPressed };
    }
    return { direction: 'idle', jump: input.jumpPressed };
}

export interface InputSnapshot {
  left: boolean;
  right: boolean;
  jumpPressed: boolean;
}

export interface Intent {
  direction: 'forward' | 'backward' | 'idle';
  jump: boolean;
}

export function resolveIntent(input: InputSnapshot): Intent {
  if (input.left && !input.right) {
    return { direction: 'backward', jump: input.jumpPressed };
  }

  if (input.right && !input.left) {
    return { direction: 'forward', jump: input.jumpPressed };
  }

  return { direction: 'idle', jump: input.jumpPressed };
}

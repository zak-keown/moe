// TODO(task-4): replace this local placeholder with the real
// `JigExtensionCommand` type imported from `@bubstack/moe-jig/extension`
// once Task 2 lands that export. Task 4 also fills in the actual
// validate/seed commands this array currently stubs out as empty.
interface JigExtensionCommand {
  name: string;
  description: string;
  run: (args: string[]) => Promise<void> | void;
}

export const commands: JigExtensionCommand[] = [];

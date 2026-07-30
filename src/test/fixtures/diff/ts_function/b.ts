export const greet = (name: string, formal: boolean): string => {
	const message = `Hello, ${name}!
Welcome to the application.`;
	if (formal) return `Dear ${name}`;
	return message;
};

export const VERSION = 2;

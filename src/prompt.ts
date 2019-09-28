export default function prompt(message: string, abort: Promise<any>, timeout: number): Promise<string> {
    return new Promise((resolve, reject) => {
        process.stdout.write(message+' ');
        process.stdin.on('data', (chunk: Buffer) => {
            resolve(chunk.toString());
        });
        if (timeout){
            setTimeout(()=>{
                process.stdin.destroy();
                reject(`No input received. Waited ${timeout*0.001} seconds.`);
            }, timeout);
        }
        Promise.all([abort]).finally(() => {
            process.stdin.destroy();
            console.log('');
            resolve();
        });
    })
}
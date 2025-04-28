//% color=#008080 icon="\uf1eb" weight=90
namespace ESP8266HTTP {
    let buffer = "";
    let response = "";
    let onResponseHandler: (data: string) => void = null;

    // Initialize UART and ESP8266
    //% block="initialize ESP8266 TX %tx RX %rx at baud rate %baudRate"
    //% tx.defl=SerialPin.P0
    //% rx.defl=SerialPin.P1
    //% baudRate.defl=115200
    export function initESP8266(tx: SerialPin, rx: SerialPin, baudRate: BaudRate): void {
        serial.redirect(tx, rx, baudRate);
        serial.onDataReceived(serial.delimiters(Delimiters.NewLine), () => {
            const data = serial.readUntil(serial.delimiters(Delimiters.NewLine));
            buffer += data;

            // Process all complete +IPD messages in buffer
            while (buffer.includes("+IPD")) {
                const ipdStart = buffer.indexOf("+IPD");
                const lengthEnd = buffer.indexOf(":", ipdStart);
                const dataEnd = buffer.indexOf("\n", ipdStart);

                if (lengthEnd > -1 && dataEnd > -1) {
                    const length = parseInt(buffer.substr(ipdStart + 5, lengthEnd - (ipdStart + 5)));
                    const ipdData = buffer.substr(lengthEnd + 1, dataEnd - (lengthEnd + 1));
                    response += ipdData;
                    buffer = buffer.substr(dataEnd + 1);
                } else {
                    break;
                }
            }

            // Check for CLOSED (end of response)
            if (buffer.includes("CLOSED") && onResponseHandler) {
                onResponseHandler(response);
                response = "";
                buffer = "";
            }
        });
    }

    // Send AT Command with basic error checking
    function sendATCommand(cmd: string, timeout: number = 2000): boolean {
        serial.writeString(cmd + "\r\n");
        let response = "";
        const start = input.runningTime();

        while (input.runningTime() - start < timeout) {
            const incoming = serial.readString();
            if (incoming.length > 0) {
                response += incoming;
                if (response.includes("\n")) {
                    const lines = response.split("\n");
                    for (let line of lines) {
                        if (line.includes("OK")) return true;
                        if (line.includes("ERROR")) return false;
                    }
                    response = "";
                }
            }
            basic.pause(10);
        }
        return false;
    }

    // Connect to Wi-Fi
    //% block="connect to WiFi SSID %ssid password %pwd"
    //% ssid.defl="your_ssid"
    //% pwd.defl="your_password"
    export function connectWifi(ssid: string, pwd: string): boolean {
        if (!sendATCommand("AT")) return false;
        if (!sendATCommand("AT+CWMODE=1")) return false;
        return sendATCommand(`AT+CWJAP="${ssid}","${pwd}"`, 10000);
    }

    // Send HTTP GET Request
    //% block="HTTP GET %url || then %handler"
    //% url.defl="http://example.com"
    //% handler.defl=null
    export function httpGet(url: string, handler?: (data: string) => void): boolean {
        // Clear previous response
        response = "";
        buffer = "";

        if (handler) onResponseHandler = handler;

        // Parse URL
        let domain = "";
        let path = "/";
        if (url.includes("http://")) {
            const afterProtocol = url.substr(7);
            const firstSlash = afterProtocol.indexOf("/");
            domain = firstSlash == -1 ? afterProtocol : afterProtocol.substr(0, firstSlash);
            path = firstSlash == -1 ? "/" : afterProtocol.substr(firstSlash);
        }

        if (domain == "") return false;

        // Establish connection
        if (!sendATCommand(`AT+CIPSTART="TCP","${domain}",80`)) return false;

        // Send request
        const request = `GET ${path} HTTP/1.1\r\nHost: ${domain}\r\nConnection: close\r\n\r\n`;
        if (!sendATCommand(`AT+CIPSEND=${request.length}`)) return false;

        serial.writeString(request);
        return true;
    }

    //% block="on HTTP response"
    export function onResponse(cb: (data: string) => void) {
        onResponseHandler = cb;
    }
}
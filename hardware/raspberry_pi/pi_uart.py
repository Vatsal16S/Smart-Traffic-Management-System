import serial
import time
import json

class UARTTransmitter:
    def __init__(self, port='/dev/ttyUSB0', baudrate=115200, timeout=1):
        """
        Initializes the UART connection to the STM32.
        Note: The port might be /dev/ttyAMA0 or /dev/ttyUSB0 depending on the Pi setup.
        """
        self.port = port
        self.baudrate = baudrate
        self.timeout = timeout
        self.serial_conn = None
        
        try:
            self.serial_conn = serial.Serial(self.port, self.baudrate, timeout=self.timeout)
            print(f"UART successfully initialized on {self.port} at {self.baudrate} baud.")
        except serial.SerialException as e:
            print(f"Warning: Could not open UART port {self.port}. Are you running this on the Raspberry Pi?")
            print(f"Error details: {e}")
            print("UARTTransmitter will run in simulation mode (printing to console instead of hardware).")

    def send_signal_decision(self, lane_name, green_time):
        """
        Formats and sends the signal decision to the STM32.
        Packet format: <LANE_ID,GREEN_TIME>\n
        """
        # Map logical lane names to integer IDs if required by STM32
        lane_map = {
            "North_Lane": 1,
            "East_Lane": 2,
            "South_Lane": 3,
            "West_Lane": 4
        }
        
        lane_id = lane_map.get(lane_name, 0) # 0 = Unknown/Fallback
        
        # Simple robust packet structure
        packet = f"<{lane_id},{green_time}>\n"
        
        if self.serial_conn and self.serial_conn.is_open:
            try:
                self.serial_conn.write(packet.encode('utf-8'))
                print(f"[UART TX] Sent: {packet.strip()}")
            except Exception as e:
                print(f"[UART TX Error] Failed to send packet: {e}")
        else:
            # Simulation mode
            print(f"[UART TX (Simulated)] Sent: {packet.strip()}")

    def wait_for_cycle_completion(self):
        """
        Waits for an acknowledgment from the STM32 that the traffic cycle (Green -> Yellow -> Red) has finished.
        """
        if not self.serial_conn or not self.serial_conn.is_open:
            # If simulating, just wait a few seconds
            time.sleep(1)
            print("[UART RX (Simulated)] Received: CYCLE_COMPLETE")
            return True

        print("[UART] Waiting for STM32 cycle completion...")
        while True:
            if self.serial_conn.in_waiting > 0:
                response = self.serial_conn.readline().decode('utf-8').strip()
                if response == "CYCLE_COMPLETE":
                    print(f"[UART RX] Received: {response}")
                    return True
            time.sleep(0.1)

if __name__ == "__main__":
    # Test script
    tx = UARTTransmitter(port="COM3") # Use a COM port for Windows testing
    tx.send_signal_decision("North_Lane", 45)
    tx.wait_for_cycle_completion()

// Run this on STM32 (e.g. using Arduino IDE with STM32duino core)

// Define GPIO pins for the Traffic Light
const int redPin = PA0;
const int yellowPin = PA1;
const int greenPin = PA2;

void setup() {
  // Start UART communication with Raspberry Pi 5 at 115200 baud
  Serial.begin(115200); 
  
  pinMode(redPin, OUTPUT);
  pinMode(yellowPin, OUTPUT);
  pinMode(greenPin, OUTPUT);
  
  // Initial state: Red
  setLights(HIGH, LOW, LOW);
  Serial.println("STM32 Ready");
}

void loop() {
  // Wait for density command from Raspberry Pi 5
  if (Serial.available() > 0) {
    String command = Serial.readStringUntil('\n');
    command.trim();
    
    // Check if the command is telling us to turn Green
    if (command.startsWith("GREEN:")) {
      int greenTime = command.substring(6).toInt();
      
      // Execute the traffic cycle with the allotted time
      runTrafficCycle(greenTime);
      
      // Tell Pi 5 we are done so it can scan again
      Serial.println("CYCLE_COMPLETE");
    }
  }
}

void runTrafficCycle(int greenSeconds) {
  // Turn Green
  setLights(LOW, LOW, HIGH);
  delay(greenSeconds * 1000); // delay() pauses STM32 for the specified milliseconds
  
  // Turn Yellow
  setLights(LOW, HIGH, LOW);
  delay(2000); // 2 seconds yellow
  
  // Turn Red
  setLights(HIGH, LOW, LOW);
}

// Helper function to easily set all three LEDs
void setLights(int r, int y, int g) {
  digitalWrite(redPin, r);
  digitalWrite(yellowPin, y);
  digitalWrite(greenPin, g);
}

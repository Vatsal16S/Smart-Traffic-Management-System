import serial
import time
import random 

# NOTE: In reality, you'd import the YDLidar SDK here
# import ydlidar

# Setup Serial communication to STM32
# /dev/ttyAMA0 or /dev/ttyUSB0 depending on how you wire the STM32 to the Pi 5
stm32_serial = serial.Serial('/dev/ttyUSB0', 115200, timeout=1)

def get_lidar_density():
    # MOCK LIDAR DATA for testing the logic on Pi 5 without spinning the lidar
    # In reality, you'd read YDLidar point cloud here
    # and count points within a specific angle/distance (Region of Interest)
    
    # Simulating a random density (number of vehicles) for testing
    density_value = random.randint(0, 100) 
    print(f"[Pi 5] LiDAR Scan Density detected: {density_value} vehicles/objects")
    return density_value

def calculate_green_time(density):
    # Map density to green time
    if density > 70:
        return 15 # 15 seconds for heavy traffic
    elif density > 30:
        return 10 # 10 seconds for medium traffic
    else:
        return 5  # 5 seconds for light traffic

# Main Loop
while True:
    print("\n[Pi 5] Scanning intersection with LiDAR...")
    density = get_lidar_density()
    green_time = calculate_green_time(density)
    
    command = f"GREEN:{green_time}\n"
    print(f"[Pi 5] Sending command to STM32: {command.strip()}")
    
    # Send command to STM32 over UART
    stm32_serial.write(command.encode('utf-8'))
    
    # Wait for STM32 to finish its traffic cycle before sending the next command
    print("[Pi 5] Waiting for STM32 to complete traffic cycle...")
    response = stm32_serial.readline().decode('utf-8').strip()
    while response != "CYCLE_COMPLETE":
        response = stm32_serial.readline().decode('utf-8').strip()
        time.sleep(0.1)
        
    print("[Pi 5] Cycle complete. Restarting scan.")

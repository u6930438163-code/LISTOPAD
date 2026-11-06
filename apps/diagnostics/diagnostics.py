import os, time, resource

def monitor():
    rss_mb = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024.0
    load1, load5, load15 = os.getloadavg()
    print("--- DIAGNOSTYKA SYSTEMU ---")
    print(f"RAM Usage (Process RSS): {rss_mb:.2f} MB")
    print(f"CPU Load Avg: {load1:.2f} / {load5:.2f} / {load15:.2f}")

if __name__ == "__main__":
    monitor()

# Custom Admin Scripts

## Overview

These scripts are **custom-built for personal and exploratory use**, designed to help audit, manage, and report on various IT environments.  
Currently, scripts include functionality for:

- **Azure**: auditing managed and unmanaged disks, VMs, VM Scale Sets (VMSS), orphaned disks, and migration flags.  
- **Jamf Pro**: device and inventory management (additional scripts may be added).  
- Other environments or tools may be included in the future.

The scripts are tailored to real-world scenarios and my own workflows. They are designed to **help automate repetitive tasks, generate reports, and flag items for further action**.

---

## Important Notes & Disclaimer

**⚠️ Use at Your Own Risk!**

- These scripts are provided **as-is** and **may never be actively updated**.  
- I **do not take any responsibility** for any issues, downtime, or data loss that may occur when using these scripts in your environment.  
- Always test in a **non-production or sandbox environment** before running in production.  
- Ensure you have **adequate permissions** before auditing or modifying resources in any environment.  

---

## Contributing & Improvements

I welcome contributions and suggestions:

- If you notice bugs, potential optimizations, or improvements, please **submit a change request**.  
- I may review your suggestions and incorporate them if they align with the intended use of the scripts.  
- Keep in mind: these scripts are **tailored to my workflow**, so not all suggestions may be adopted.  

---

## Usage Tips

- Some scripts require **PowerShell 7+** for optimal performance (especially those using parallel processing).  
- Make sure any required modules or dependencies are installed before running the scripts.  
- Scripts may work across **multi-tenant or multi-system environments**, but always verify access and permissions first.  
- Output is typically in **CSV or Excel** for easier reporting and analysis.  

---

## Summary

These scripts are meant as **tools to help automate and audit your environments**, not as official support or production-ready solutions.  

**Run at your own risk, help improve them, and use them wisely!**

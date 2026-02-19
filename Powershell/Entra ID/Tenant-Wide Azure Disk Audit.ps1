# placeholder file
<#
.SYNOPSIS
    Tenant-wide Azure Disk Audit Script (VMs, VM Scale Sets, Managed & Unmanaged Disks)

.DESCRIPTION
    This script collects detailed information about all disks in a specified Azure tenant,
    across all subscriptions. It includes VMs, VM Scale Sets (VMSS), and orphaned managed disks.
    It tracks OS and Data disks, disk size, SKU, encryption type, and flags unmanaged disks
    for migration tracking.

    The script outputs:
    - A full CSV of all disks.
    - An Excel workbook with three summary sheets:
        1. ComputeType-DiskType
        2. DiskTier
        3. MigrationPriority
      Conditional formatting highlights high/medium/low migration priorities.

.NOTES
    - Requires PowerShell 7+ for parallel processing using 'ForEach-Object -Parallel'.
    - Requires the following modules:
        * Az.Accounts
        * Az.Compute
        * Az.Storage
        * ImportExcel
    - Ensure you have adequate permissions to read VMs, VMSS, and managed disks across all subscriptions.
    - Recommended: Run on a system with enough memory when auditing large tenants.
    - Uses parallel processing with a throttle limit (default: 5) for faster execution.
    - Enter the Tenant ID at runtime when prompted.

.EXAMPLE
    PS> .\AzureTenantDiskAudit.ps1
    Enter the Azure Tenant ID to audit: XYYXXXXX-XXYY-XXYX-XXYX-XXXXXYXXXYYX
    # The script will run, collect all disk data, and generate CSV + Excel summary.
#>

# ==========================================
# PROMPT FOR TENANT ID
# ==========================================
$TenantId = Read-Host "Enter the Azure Tenant ID to audit"

# Paths for CSV and Excel
$fullCsvPath = ".\Tenant-Full-Compute-Disk-Audit.csv"
$excelPath   = ".\Tenant-Disk-Summary.xlsx"

# ==========================================
# CONNECT TO TENANT
# ==========================================
Connect-AzAccount -Tenant $TenantId -SkipContextPopulation

# ==========================================
# ENSURE IMPORTEXCEL MODULE
# ==========================================
if (-not (Get-Module -ListAvailable -Name ImportExcel)) {
    Install-Module -Name ImportExcel -Scope CurrentUser -Force
}
Import-Module ImportExcel

# ==========================================
# GET ALL SUBSCRIPTIONS
# ==========================================
$subscriptions = Get-AzSubscription -TenantId $TenantId
$results = [System.Collections.Concurrent.ConcurrentBag[PSObject]]::new()

# ==========================================
# PARALLEL PROCESSING OF SUBSCRIPTIONS
# ==========================================
$throttle = 5 # Number of parallel threads

$subscriptions | ForEach-Object -Parallel {
    param($sub, $TenantId, $results)

    Set-AzContext -SubscriptionId $sub.Id | Out-Null

    $vms = Get-AzVM
    $vmssList = Get-AzVmss
    $allManagedDisks = Get-AzDisk
    $diskLookup = @{}
    foreach ($disk in $allManagedDisks) { $diskLookup[$disk.Id] = $disk }

    function Add-DiskRecord($ComputeType, $ComputeName, $InstanceId, $diskObj, $diskRole, $sub) {
        $TenantId = $using:TenantId
        if ($diskObj.ManagedDisk) {
            $md = $using:diskLookup[$diskObj.ManagedDisk.Id]
            $diskTier = $md.Sku.Name
            $migrationStatus = "Managed"
        } else {
            $storageAccount = if ($diskObj.Vhd) { ($diskObj.Vhd.Uri -split "/")[2] -split "\." | Select-Object -First 1 } else { "" }
            $diskTier = if ($storageAccount) { (Get-AzStorageAccount -ResourceGroupName $diskObj.ResourceGroupName -Name $storageAccount -ErrorAction SilentlyContinue).Sku.Name } else { "Unknown" }
            $migrationStatus = "Unmanaged - Needs Migration"
        }

        $migrationPriority = switch ($ComputeType) {
            "VMSS" { if ($migrationStatus -like "*Unmanaged*") {"High - VMSS Unmanaged"} else {"None"} }
            "VM"   { if ($migrationStatus -like "*Unmanaged*") {"Medium - VM Unmanaged"} else {"None"} }
            default { "None" }
        }

        $results.Add([PSCustomObject]@{
            TenantId           = $TenantId
            SubscriptionName   = $sub.Name
            SubscriptionId     = $sub.Id
            ResourceGroup      = $diskObj.ResourceGroupName
            ComputeType        = $ComputeType
            ComputeName        = $ComputeName
            InstanceId         = $InstanceId
            Location           = $diskObj.Location
            DiskType           = $diskRole
            DiskName           = if ($diskObj.ManagedDisk) { $md.Name } else { $diskObj.Name }
            DiskSizeGB         = if ($diskObj.ManagedDisk) { $md.DiskSizeGB } else { $diskObj.DiskSizeGB }
            SKU                = if ($diskObj.ManagedDisk) { $md.Sku.Name } else { "Unmanaged" }
            EncryptionType     = if ($diskObj.ManagedDisk) { $md.Encryption.Type } else { "StorageAccountEncryption" }
            ManagedDiskId      = if ($diskObj.ManagedDisk) { $md.Id } else { "" }
            VhdUri             = if ($diskObj.ManagedDisk) { "" } else { if ($diskObj.Vhd) {$diskObj.Vhd.Uri} else {""} }
            StorageAccount     = if ($diskObj.ManagedDisk) { "" } else { $storageAccount }
            AttachmentType     = "Attached"
            MigrationStatus    = $migrationStatus
            DiskTier           = $diskTier
            MigrationPriority  = $migrationPriority
        })
    }

    # Process VMs
    $vms | ForEach-Object -Parallel {
        param($vm, $diskLookup, $sub, $results)
        Add-DiskRecord "VM" $vm.Name "" $vm.StorageProfile.OsDisk "OS" $sub
        foreach ($dd in $vm.StorageProfile.DataDisks) {
            Add-DiskRecord "VM" $vm.Name "" $dd "Data" $sub
        }
    } -ThrottleLimit $using:throttle

    # Process VMSS
    $vmssList | ForEach-Object -Parallel {
        param($vmss, $diskLookup, $sub, $results)
        $instances = Get-AzVmssVM -ResourceGroupName $vmss.ResourceGroupName -VMScaleSetName $vmss.Name
        foreach ($inst in $instances) {
            Add-DiskRecord "VMSS" $vmss.Name $inst.InstanceId $inst.StorageProfile.OsDisk "OS" $sub
            foreach ($dd in $inst.StorageProfile.DataDisks) {
                Add-DiskRecord "VMSS" $vmss.Name $inst.InstanceId $dd "Data" $sub
            }
        }
    } -ThrottleLimit $using:throttle

    # Orphaned Managed Disks
    $orphanedDisks = $allManagedDisks | Where-Object { -not $_.ManagedBy }
    foreach ($disk in $orphanedDisks) {
        $diskType = if ($disk.OsType) { "OS" } else { "Data" }
        $results.Add([PSCustomObject]@{
            TenantId           = $TenantId
            SubscriptionName   = $sub.Name
            SubscriptionId     = $sub.Id
            ResourceGroup      = $disk.ResourceGroupName
            ComputeType        = "None"
            ComputeName        = ""
            InstanceId         = ""
            Location           = $disk.Location
            DiskType           = $diskType
            DiskName           = $disk.Name
            DiskSizeGB         = $disk.DiskSizeGB
            SKU                = $disk.Sku.Name
            EncryptionType     = $disk.Encryption.Type
            ManagedDiskId      = $disk.Id
            VhdUri             =

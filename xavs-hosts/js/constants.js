export const CONFIG_DIR      = "/etc/xavs";
export const CONFIG_PATH     = CONFIG_DIR + "/nodes.json";
export const NODES_YAML_PATH = CONFIG_DIR + "/nodes.yml";
export const INVENTORY_DIR   = CONFIG_DIR + "/inventory";
export const INVENTORY_PATH  = INVENTORY_DIR + "/multinode";
export const ROLES           = ["control","network","compute","storage","monitoring","deployment"];
export const DEPLOYMENT_ROLE = "deployment";
export const PAGE_SIZE       = 10;
export const ETC_HOSTS_PATH = "/etc/hosts";
export const ETC_BEGIN_MARK = "# XAVS-BEGIN managed";
export const ETC_END_MARK   = "# XAVS-END";
export const MAX_PAGE_SIZE = 100;  // hard cap for "load more"
export const SSH_KEY_PATH  = "/root/.ssh/xavs";
export const SSH_PUB_PATH  = "/root/.ssh/xavs.pub";


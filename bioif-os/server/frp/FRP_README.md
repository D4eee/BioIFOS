# FRP 映射指引（手动配置）

本项目支持通过环境变量使用 FRP 映射后的地址连接 B 端（SSH/SFTP/终端等）。实际的 frpc/frps 启动仍需你在 B 端自行部署。

## A 端（后端）配置
在运行 A 端后端前设置以下环境变量（systemd/`source` 等方式均可）：

```
# 映射后的公网地址与端口
export BIOIFOS_B_FRP_ENABLED=1
export BIOIFOS_B_FRP_ADDR=tcp://<公网IP或域名>:<端口>
# 可选：单独覆盖端口
# export BIOIFOS_B_FRP_PORT=7000

# 原有 SSH 账号信息仍需配置
export BIOIFOS_B_USER=<b_ssh_user>
export BIOIFOS_B_PASS=<b_ssh_pass>    # 或使用密钥 BIOIFOS_B_KEY / BIOIFOS_B_KEY_PASS
# 根目录（可选）
# export BIOIFOS_B_ROOT=/data
```

启动后，A 端会优先使用 `BIOIFOS_B_FRP_ADDR`（或 `BIOIFOS_B_FRP_PORT`）作为 SSH/SFTP 连接的 host/port。

## B 端 frpc 示例
在 B 端准备 `frpc.ini`（示例，仅供参考）：
```
[common]
server_addr = <frps_host>
server_port = <frps_port>

[ssh_bioifos]
type = tcp
local_ip = 127.0.0.1
local_port = 22
remote_port = 7000  # 对应上面的 BIOIFOS_B_FRP_ADDR 的端口
```

启动：
```
./frpc -c frpc.ini
```

请确保：
- FRP 映射的端口已在云防火墙/安全组放行
- B 端 SSH 账号/密码或密钥可用

## 注意
- A 端不会自动启动 frpc，需手动运维 B 端的 FRP。
- 环境变量优先级：若设置了 `BIOIFOS_B_FRP_ADDR`/`BIOIFOS_B_FRP_ENABLED`，则覆盖原始的 `BIOIFOS_B_HOST/B_PORT`。

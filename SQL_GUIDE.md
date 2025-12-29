# SQL 从入门到精通

基于本项目的真实表结构，系统学习 SQL。

## 目录

1. [基础查询](#1-基础查询)
2. [条件筛选](#2-条件筛选)
3. [排序与分页](#3-排序与分页)
4. [聚合函数](#4-聚合函数)
5. [分组查询](#5-分组查询)
6. [多表连接](#6-多表连接)
7. [子查询](#7-子查询)
8. [数据操作](#8-数据操作)
9. [高级技巧](#9-高级技巧)
10. [性能优化](#10-性能优化)
11. [实战练习](#11-实战练习)

---

## 数据库表结构

```
users          - 用户表
posts          - 文章表
products       - 商品表
categories     - 分类表
orders         - 订单表
order_items    - 订单项表
cart_items     - 购物车表
operation_logs - 操作日志表
```

---

## 1. 基础查询

### SELECT 基本语法

```sql
-- 查询所有列
SELECT * FROM users;

-- 查询指定列
SELECT id, name, email FROM users;

-- 使用别名
SELECT
  id AS 用户ID,
  name AS 用户名,
  email AS 邮箱
FROM users;

-- 去重
SELECT DISTINCT role FROM users;

-- 计算列
SELECT
  name,
  price,
  stock,
  price * stock AS 库存价值
FROM products;
```

### 练习题

```sql
-- 1. 查询所有商品的名称和价格
SELECT name, price FROM products;

-- 2. 查询所有用户的邮箱（去重）
SELECT DISTINCT email FROM users;

-- 3. 计算每个商品的含税价格（税率10%）
SELECT name, price, price * 1.1 AS price_with_tax FROM products;
```

---

## 2. 条件筛选

### WHERE 子句

```sql
-- 等于
SELECT * FROM users WHERE role = 'ADMIN';

-- 不等于
SELECT * FROM products WHERE status != 'INACTIVE';

-- 大于/小于
SELECT * FROM products WHERE price > 100;
SELECT * FROM products WHERE stock < 10;

-- 范围
SELECT * FROM products WHERE price BETWEEN 100 AND 500;

-- 列表
SELECT * FROM orders WHERE status IN ('PENDING', 'PAID');

-- 空值
SELECT * FROM users WHERE avatar IS NULL;
SELECT * FROM users WHERE avatar IS NOT NULL;

-- 模糊匹配
SELECT * FROM products WHERE name LIKE '%手机%';    -- 包含
SELECT * FROM products WHERE name LIKE '苹果%';     -- 开头
SELECT * FROM products WHERE name LIKE '%Pro';      -- 结尾
SELECT * FROM products WHERE name LIKE '___';       -- 3个字符

-- 多条件 AND
SELECT * FROM products
WHERE price > 100
  AND stock > 0
  AND status = 'ACTIVE';

-- 多条件 OR
SELECT * FROM orders
WHERE status = 'PENDING'
   OR status = 'PAID';

-- 复杂条件
SELECT * FROM products
WHERE (price > 1000 OR sales_count > 100)
  AND status = 'ACTIVE';
```

### 练习题

```sql
-- 1. 查询价格在 500-1000 之间的商品
SELECT * FROM products WHERE price BETWEEN 500 AND 1000;

-- 2. 查询名称包含"iPhone"的商品
SELECT * FROM products WHERE name LIKE '%iPhone%';

-- 3. 查询库存不足10且状态为ACTIVE的商品
SELECT * FROM products WHERE stock < 10 AND status = 'ACTIVE';

-- 4. 查询已完成或已取消的订单
SELECT * FROM orders WHERE status IN ('COMPLETED', 'CANCELLED');
```

---

## 3. 排序与分页

### ORDER BY 排序

```sql
-- 升序（默认）
SELECT * FROM products ORDER BY price ASC;

-- 降序
SELECT * FROM products ORDER BY price DESC;

-- 多列排序
SELECT * FROM products
ORDER BY category_id ASC, price DESC;

-- 按表达式排序
SELECT *, price * stock AS total_value
FROM products
ORDER BY total_value DESC;

-- NULL 值排序
SELECT * FROM users ORDER BY avatar IS NULL, name;
```

### LIMIT 分页

```sql
-- 取前10条
SELECT * FROM products LIMIT 10;

-- 跳过前20条，取10条（第3页，每页10条）
SELECT * FROM products LIMIT 10 OFFSET 20;
-- 等价于
SELECT * FROM products LIMIT 20, 10;

-- 分页公式: LIMIT pageSize OFFSET (page - 1) * pageSize
-- 第5页，每页20条
SELECT * FROM products LIMIT 20 OFFSET 80;
```

### 练习题

```sql
-- 1. 按销量降序查询前10个商品
SELECT * FROM products ORDER BY sales_count DESC LIMIT 10;

-- 2. 查询最新注册的5个用户
SELECT * FROM users ORDER BY created_at DESC LIMIT 5;

-- 3. 分页查询订单（第3页，每页15条）
SELECT * FROM orders ORDER BY created_at DESC LIMIT 15 OFFSET 30;
```

---

## 4. 聚合函数

### 常用聚合函数

```sql
-- 计数
SELECT COUNT(*) AS 总数 FROM users;
SELECT COUNT(avatar) AS 有头像用户数 FROM users;  -- 不计NULL
SELECT COUNT(DISTINCT category_id) AS 分类数 FROM products;

-- 求和
SELECT SUM(stock) AS 总库存 FROM products;
SELECT SUM(price * stock) AS 总库存价值 FROM products;

-- 平均值
SELECT AVG(price) AS 平均价格 FROM products;
SELECT ROUND(AVG(price), 2) AS 平均价格 FROM products;  -- 保留2位小数

-- 最大/最小
SELECT MAX(price) AS 最高价, MIN(price) AS 最低价 FROM products;
SELECT MAX(created_at) AS 最新订单时间 FROM orders;

-- 组合使用
SELECT
  COUNT(*) AS 商品数,
  SUM(stock) AS 总库存,
  AVG(price) AS 平均价格,
  MAX(price) AS 最高价,
  MIN(price) AS 最低价
FROM products
WHERE status = 'ACTIVE';
```

### 练习题

```sql
-- 1. 统计用户总数
SELECT COUNT(*) FROM users;

-- 2. 计算所有订单的总金额
SELECT SUM(total_amount) FROM orders;

-- 3. 统计ACTIVE状态商品的数量、平均价格、总库存
SELECT
  COUNT(*) AS count,
  AVG(price) AS avg_price,
  SUM(stock) AS total_stock
FROM products
WHERE status = 'ACTIVE';
```

---

## 5. 分组查询

### GROUP BY

```sql
-- 按分类统计商品数
SELECT
  category_id,
  COUNT(*) AS product_count
FROM products
GROUP BY category_id;

-- 按状态统计订单
SELECT
  status,
  COUNT(*) AS order_count,
  SUM(total_amount) AS total_amount
FROM orders
GROUP BY status;

-- 按用户统计订单
SELECT
  user_id,
  COUNT(*) AS order_count,
  SUM(total_amount) AS total_spent,
  AVG(total_amount) AS avg_order_value
FROM orders
GROUP BY user_id
ORDER BY total_spent DESC;

-- 多列分组
SELECT
  category_id,
  status,
  COUNT(*) AS count,
  AVG(price) AS avg_price
FROM products
GROUP BY category_id, status;
```

### HAVING 过滤分组

```sql
-- 筛选订单数大于5的用户
SELECT
  user_id,
  COUNT(*) AS order_count
FROM orders
GROUP BY user_id
HAVING COUNT(*) > 5;

-- 筛选平均价格大于100的分类
SELECT
  category_id,
  AVG(price) AS avg_price,
  COUNT(*) AS product_count
FROM products
GROUP BY category_id
HAVING AVG(price) > 100;

-- WHERE vs HAVING
-- WHERE: 分组前过滤（过滤行）
-- HAVING: 分组后过滤（过滤组）
SELECT
  category_id,
  AVG(price) AS avg_price
FROM products
WHERE status = 'ACTIVE'      -- 先筛选ACTIVE商品
GROUP BY category_id
HAVING AVG(price) > 100;     -- 再筛选平均价格>100的分类
```

### 练习题

```sql
-- 1. 统计每个分类的商品数量
SELECT category_id, COUNT(*) AS count
FROM products
GROUP BY category_id;

-- 2. 统计每个用户的订单数和总消费，只显示消费超过1000的
SELECT
  user_id,
  COUNT(*) AS order_count,
  SUM(total_amount) AS total_spent
FROM orders
GROUP BY user_id
HAVING SUM(total_amount) > 1000;

-- 3. 按月统计订单量和销售额
SELECT
  DATE_FORMAT(created_at, '%Y-%m') AS month,
  COUNT(*) AS order_count,
  SUM(total_amount) AS total_amount
FROM orders
GROUP BY DATE_FORMAT(created_at, '%Y-%m')
ORDER BY month;
```

---

## 6. 多表连接

### INNER JOIN（内连接）

```sql
-- 查询订单及用户信息
SELECT
  o.id,
  o.order_no,
  o.total_amount,
  u.name AS user_name,
  u.email
FROM orders o
INNER JOIN users u ON o.user_id = u.id;

-- 查询商品及分类
SELECT
  p.name AS product_name,
  p.price,
  c.name AS category_name
FROM products p
INNER JOIN categories c ON p.category_id = c.id;

-- 三表连接：订单 -> 订单项 -> 商品
SELECT
  o.order_no,
  p.name AS product_name,
  oi.quantity,
  oi.price,
  oi.quantity * oi.price AS subtotal
FROM orders o
INNER JOIN order_items oi ON o.id = oi.order_id
INNER JOIN products p ON oi.product_id = p.id
WHERE o.id = 1;
```

### LEFT JOIN（左连接）

```sql
-- 查询所有用户及其订单数（包括没有订单的用户）
SELECT
  u.id,
  u.name,
  COUNT(o.id) AS order_count
FROM users u
LEFT JOIN orders o ON u.id = o.user_id
GROUP BY u.id, u.name;

-- 查询所有商品及其分类（包括未分类的商品）
SELECT
  p.name AS product_name,
  c.name AS category_name
FROM products p
LEFT JOIN categories c ON p.category_id = c.id;

-- 查找没有下过单的用户
SELECT u.*
FROM users u
LEFT JOIN orders o ON u.id = o.user_id
WHERE o.id IS NULL;
```

### RIGHT JOIN（右连接）

```sql
-- 查询所有分类及其商品数（包括空分类）
SELECT
  c.name AS category_name,
  COUNT(p.id) AS product_count
FROM products p
RIGHT JOIN categories c ON p.category_id = c.id
GROUP BY c.id, c.name;
```

### 自连接

```sql
-- 查询分类及其父分类
SELECT
  c.name AS category,
  p.name AS parent_category
FROM categories c
LEFT JOIN categories p ON c.parent_id = p.id;

-- 查询用户推荐关系
-- 假设有 referrer_id 字段
SELECT
  u.name AS user_name,
  r.name AS referrer_name
FROM users u
LEFT JOIN users r ON u.referrer_id = r.id;
```

### 练习题

```sql
-- 1. 查询每个用户的订单总数和总消费（包括没有订单的用户）
SELECT
  u.id,
  u.name,
  COUNT(o.id) AS order_count,
  COALESCE(SUM(o.total_amount), 0) AS total_spent
FROM users u
LEFT JOIN orders o ON u.id = o.user_id
GROUP BY u.id, u.name;

-- 2. 查询订单详情（包含用户名、商品名、数量、金额）
SELECT
  o.order_no,
  u.name AS user_name,
  p.name AS product_name,
  oi.quantity,
  oi.price
FROM orders o
JOIN users u ON o.user_id = u.id
JOIN order_items oi ON o.id = oi.order_id
JOIN products p ON oi.product_id = p.id;

-- 3. 查找没有商品的分类
SELECT c.*
FROM categories c
LEFT JOIN products p ON c.id = p.category_id
WHERE p.id IS NULL;
```

---

## 7. 子查询

### WHERE 中的子查询

```sql
-- 查询购买过商品ID=1的用户
SELECT * FROM users
WHERE id IN (
  SELECT DISTINCT user_id
  FROM orders o
  JOIN order_items oi ON o.id = oi.order_id
  WHERE oi.product_id = 1
);

-- 查询高于平均价格的商品
SELECT * FROM products
WHERE price > (SELECT AVG(price) FROM products);

-- 查询每个分类中价格最高的商品
SELECT * FROM products p
WHERE price = (
  SELECT MAX(price)
  FROM products
  WHERE category_id = p.category_id
);

-- EXISTS 子查询：查询有订单的用户
SELECT * FROM users u
WHERE EXISTS (
  SELECT 1 FROM orders o WHERE o.user_id = u.id
);
```

### FROM 中的子查询（派生表）

```sql
-- 查询消费TOP10用户的详细信息
SELECT u.*, stats.total_spent, stats.order_count
FROM users u
JOIN (
  SELECT
    user_id,
    SUM(total_amount) AS total_spent,
    COUNT(*) AS order_count
  FROM orders
  GROUP BY user_id
  ORDER BY total_spent DESC
  LIMIT 10
) stats ON u.id = stats.user_id;

-- 分类销售统计
SELECT
  c.name AS category_name,
  sales.total_quantity,
  sales.total_amount
FROM categories c
LEFT JOIN (
  SELECT
    p.category_id,
    SUM(oi.quantity) AS total_quantity,
    SUM(oi.quantity * oi.price) AS total_amount
  FROM order_items oi
  JOIN products p ON oi.product_id = p.id
  GROUP BY p.category_id
) sales ON c.id = sales.category_id;
```

### SELECT 中的子查询

```sql
-- 查询用户及其订单数
SELECT
  u.*,
  (SELECT COUNT(*) FROM orders o WHERE o.user_id = u.id) AS order_count
FROM users u;

-- 查询商品及其销量
SELECT
  p.*,
  (SELECT COALESCE(SUM(quantity), 0)
   FROM order_items oi
   WHERE oi.product_id = p.id) AS total_sold
FROM products p;
```

### 练习题

```sql
-- 1. 查询价格高于平均价格的商品
SELECT * FROM products WHERE price > (SELECT AVG(price) FROM products);

-- 2. 查询购买了"iPhone"系列商品的用户
SELECT DISTINCT u.* FROM users u
WHERE u.id IN (
  SELECT o.user_id FROM orders o
  JOIN order_items oi ON o.id = oi.order_id
  JOIN products p ON oi.product_id = p.id
  WHERE p.name LIKE '%iPhone%'
);

-- 3. 查询每个分类中销量最高的商品
SELECT p.* FROM products p
WHERE p.sales_count = (
  SELECT MAX(sales_count)
  FROM products
  WHERE category_id = p.category_id
);
```

---

## 8. 数据操作

### INSERT

```sql
-- 插入单条
INSERT INTO users (email, name, role)
VALUES ('test@example.com', '测试用户', 'USER');

-- 插入多条
INSERT INTO products (name, price, stock, category_id) VALUES
  ('商品A', 99.99, 100, 1),
  ('商品B', 199.99, 50, 1),
  ('商品C', 299.99, 30, 2);

-- 从查询结果插入
INSERT INTO operation_logs (user_id, action, target, target_id)
SELECT id, 'MIGRATE', 'user', id FROM users WHERE created_at < '2024-01-01';

-- 插入或更新（UPSERT）
INSERT INTO cart_items (user_id, product_id, quantity)
VALUES (1, 100, 2)
ON DUPLICATE KEY UPDATE quantity = quantity + 2;
```

### UPDATE

```sql
-- 更新单条
UPDATE products SET price = 999.99 WHERE id = 1;

-- 更新多列
UPDATE products
SET price = 899.99, stock = 200, status = 'ACTIVE'
WHERE id = 1;

-- 条件更新
UPDATE products SET status = 'OUT_OF_STOCK' WHERE stock = 0;

-- 使用子查询更新
UPDATE products p
SET p.category_id = (
  SELECT id FROM categories WHERE name = '手机'
)
WHERE p.name LIKE '%iPhone%';

-- 关联更新
UPDATE products p
JOIN categories c ON p.category_id = c.id
SET p.status = 'INACTIVE'
WHERE c.name = '已下架分类';
```

### DELETE

```sql
-- 删除单条
DELETE FROM cart_items WHERE id = 1;

-- 条件删除
DELETE FROM cart_items WHERE user_id = 1;

-- 删除过期数据
DELETE FROM operation_logs WHERE created_at < DATE_SUB(NOW(), INTERVAL 30 DAY);

-- 关联删除
DELETE ci FROM cart_items ci
JOIN products p ON ci.product_id = p.id
WHERE p.status = 'INACTIVE';

-- 清空表（慎用！）
TRUNCATE TABLE operation_logs;
```

### 事务

```sql
-- 开始事务
START TRANSACTION;

-- 扣减库存
UPDATE products SET stock = stock - 1 WHERE id = 1 AND stock > 0;

-- 检查是否成功
-- 如果受影响行数为0，说明库存不足

-- 创建订单
INSERT INTO orders (order_no, user_id, total_amount, status)
VALUES ('ORD20240101001', 1, 999.99, 'PENDING');

-- 创建订单项
INSERT INTO order_items (order_id, product_id, quantity, price)
VALUES (LAST_INSERT_ID(), 1, 1, 999.99);

-- 提交事务
COMMIT;

-- 或者回滚
-- ROLLBACK;
```

---

## 9. 高级技巧

### 窗口函数

```sql
-- 排名：按销量排名
SELECT
  name,
  sales_count,
  RANK() OVER (ORDER BY sales_count DESC) AS sales_rank,
  DENSE_RANK() OVER (ORDER BY sales_count DESC) AS dense_rank,
  ROW_NUMBER() OVER (ORDER BY sales_count DESC) AS row_num
FROM products;

-- 分区排名：每个分类内排名
SELECT
  name,
  category_id,
  price,
  RANK() OVER (PARTITION BY category_id ORDER BY price DESC) AS price_rank
FROM products;

-- 累计求和
SELECT
  DATE(created_at) AS date,
  total_amount,
  SUM(total_amount) OVER (ORDER BY created_at) AS cumulative_amount
FROM orders;

-- 移动平均
SELECT
  DATE(created_at) AS date,
  total_amount,
  AVG(total_amount) OVER (
    ORDER BY created_at
    ROWS BETWEEN 6 PRECEDING AND CURRENT ROW
  ) AS moving_avg_7days
FROM orders;

-- 前后值对比
SELECT
  DATE(created_at) AS date,
  total_amount,
  LAG(total_amount, 1) OVER (ORDER BY created_at) AS prev_amount,
  LEAD(total_amount, 1) OVER (ORDER BY created_at) AS next_amount
FROM orders;
```

### CASE WHEN

```sql
-- 简单CASE
SELECT
  name,
  status,
  CASE status
    WHEN 'ACTIVE' THEN '在售'
    WHEN 'INACTIVE' THEN '下架'
    WHEN 'OUT_OF_STOCK' THEN '缺货'
    ELSE '未知'
  END AS status_text
FROM products;

-- 搜索CASE（条件判断）
SELECT
  name,
  price,
  CASE
    WHEN price < 100 THEN '低价'
    WHEN price < 500 THEN '中价'
    WHEN price < 1000 THEN '高价'
    ELSE '奢侈品'
  END AS price_level
FROM products;

-- 条件聚合
SELECT
  COUNT(*) AS total,
  SUM(CASE WHEN status = 'ACTIVE' THEN 1 ELSE 0 END) AS active_count,
  SUM(CASE WHEN status = 'INACTIVE' THEN 1 ELSE 0 END) AS inactive_count,
  SUM(CASE WHEN stock = 0 THEN 1 ELSE 0 END) AS out_of_stock_count
FROM products;

-- 行转列
SELECT
  user_id,
  SUM(CASE WHEN status = 'COMPLETED' THEN total_amount ELSE 0 END) AS completed_amount,
  SUM(CASE WHEN status = 'CANCELLED' THEN total_amount ELSE 0 END) AS cancelled_amount,
  SUM(CASE WHEN status = 'PENDING' THEN total_amount ELSE 0 END) AS pending_amount
FROM orders
GROUP BY user_id;
```

### 日期函数

```sql
-- 当前时间
SELECT NOW(), CURDATE(), CURTIME();

-- 日期格式化
SELECT DATE_FORMAT(created_at, '%Y-%m-%d') FROM orders;
SELECT DATE_FORMAT(created_at, '%Y年%m月%d日') FROM orders;

-- 日期计算
SELECT DATE_ADD(NOW(), INTERVAL 7 DAY);      -- 7天后
SELECT DATE_SUB(NOW(), INTERVAL 1 MONTH);    -- 1月前

-- 日期提取
SELECT
  YEAR(created_at) AS year,
  MONTH(created_at) AS month,
  DAY(created_at) AS day,
  WEEKDAY(created_at) AS weekday  -- 0=周一
FROM orders;

-- 日期差
SELECT DATEDIFF(NOW(), created_at) AS days_ago FROM orders;

-- 按日/周/月统计
SELECT DATE(created_at), COUNT(*) FROM orders GROUP BY DATE(created_at);
SELECT YEARWEEK(created_at), COUNT(*) FROM orders GROUP BY YEARWEEK(created_at);
SELECT DATE_FORMAT(created_at, '%Y-%m'), COUNT(*) FROM orders GROUP BY DATE_FORMAT(created_at, '%Y-%m');
```

### 字符串函数

```sql
-- 拼接
SELECT CONCAT(name, ' - ', email) FROM users;
SELECT CONCAT_WS(' | ', name, email, role) FROM users;  -- 带分隔符

-- 截取
SELECT SUBSTRING(name, 1, 10) FROM products;  -- 前10字符
SELECT LEFT(name, 5) FROM products;           -- 左边5字符
SELECT RIGHT(order_no, 6) FROM orders;        -- 右边6字符

-- 替换
SELECT REPLACE(name, '手机', 'Phone') FROM products;

-- 大小写
SELECT UPPER(email), LOWER(email) FROM users;

-- 去空格
SELECT TRIM(name) FROM users;

-- 长度
SELECT name, CHAR_LENGTH(name) AS name_length FROM products;

-- 查找位置
SELECT LOCATE('手机', name) FROM products;  -- 返回位置，0表示未找到
```

---

## 10. 性能优化

### 索引使用

```sql
-- 查看表索引
SHOW INDEX FROM products;

-- 创建索引
CREATE INDEX idx_products_name ON products(name);
CREATE INDEX idx_orders_user_status ON orders(user_id, status);

-- 唯一索引
CREATE UNIQUE INDEX idx_users_email ON users(email);

-- 前缀索引（用于长字符串）
CREATE INDEX idx_products_name_prefix ON products(name(20));

-- 删除索引
DROP INDEX idx_products_name ON products;
```

### EXPLAIN 分析

```sql
-- 查看执行计划
EXPLAIN SELECT * FROM products WHERE category_id = 1;

-- 关键指标:
-- type: 访问类型 (ALL < index < range < ref < eq_ref < const)
-- possible_keys: 可能使用的索引
-- key: 实际使用的索引
-- rows: 预估扫描行数
-- Extra: 额外信息 (Using where, Using index, Using filesort)

-- 详细分析
EXPLAIN FORMAT=JSON SELECT ...;
```

### 优化技巧

```sql
-- 1. 避免 SELECT *
-- ❌ 不好
SELECT * FROM products WHERE category_id = 1;
-- ✅ 好
SELECT id, name, price FROM products WHERE category_id = 1;

-- 2. 避免在 WHERE 中对列使用函数
-- ❌ 不好（无法使用索引）
SELECT * FROM orders WHERE YEAR(created_at) = 2024;
-- ✅ 好
SELECT * FROM orders WHERE created_at >= '2024-01-01' AND created_at < '2025-01-01';

-- 3. 使用 LIMIT 限制结果
SELECT * FROM products ORDER BY sales_count DESC LIMIT 10;

-- 4. 使用覆盖索引
CREATE INDEX idx_products_cat_price ON products(category_id, price);
SELECT category_id, price FROM products WHERE category_id = 1;  -- 只查索引列

-- 5. 避免 OR，使用 UNION 或 IN
-- ❌ 不好
SELECT * FROM products WHERE category_id = 1 OR category_id = 2;
-- ✅ 好
SELECT * FROM products WHERE category_id IN (1, 2);

-- 6. 小表驱动大表
-- ❌ 不好
SELECT * FROM orders o WHERE o.user_id IN (SELECT id FROM users WHERE role = 'ADMIN');
-- ✅ 好（如果 ADMIN 用户少）
SELECT * FROM orders o WHERE EXISTS (
  SELECT 1 FROM users u WHERE u.id = o.user_id AND u.role = 'ADMIN'
);

-- 7. 分页优化
-- ❌ 不好（大偏移量）
SELECT * FROM products ORDER BY id LIMIT 100000, 10;
-- ✅ 好（使用游标）
SELECT * FROM products WHERE id > 100000 ORDER BY id LIMIT 10;
```

---

## 11. 实战练习

### 初级题目

```sql
-- 1. 查询所有价格大于100的商品名称和价格
SELECT name, price FROM products WHERE price > 100;

-- 2. 查询用户数量
SELECT COUNT(*) FROM users;

-- 3. 查询最贵的商品
SELECT * FROM products ORDER BY price DESC LIMIT 1;

-- 4. 查询每个分类的商品数量
SELECT category_id, COUNT(*) as count
FROM products
GROUP BY category_id;

-- 5. 查询2024年的订单
SELECT * FROM orders
WHERE created_at >= '2024-01-01' AND created_at < '2025-01-01';
```

### 中级题目

```sql
-- 1. 查询购买过商品的用户（去重）
SELECT DISTINCT u.*
FROM users u
JOIN orders o ON u.id = o.user_id;

-- 2. 查询每个用户的订单总金额，按金额降序排列
SELECT
  u.name,
  SUM(o.total_amount) as total_spent
FROM users u
LEFT JOIN orders o ON u.id = o.user_id
GROUP BY u.id, u.name
ORDER BY total_spent DESC;

-- 3. 查询销量TOP10的商品及其分类
SELECT
  p.name as product_name,
  c.name as category_name,
  p.sales_count
FROM products p
LEFT JOIN categories c ON p.category_id = c.id
ORDER BY p.sales_count DESC
LIMIT 10;

-- 4. 查询每月订单统计
SELECT
  DATE_FORMAT(created_at, '%Y-%m') as month,
  COUNT(*) as order_count,
  SUM(total_amount) as total_amount
FROM orders
GROUP BY DATE_FORMAT(created_at, '%Y-%m')
ORDER BY month;

-- 5. 查询没有下过单的用户
SELECT u.*
FROM users u
LEFT JOIN orders o ON u.id = o.user_id
WHERE o.id IS NULL;
```

### 高级题目

```sql
-- 1. 查询每个用户的第一笔订单
SELECT o.*
FROM orders o
WHERE o.created_at = (
  SELECT MIN(created_at)
  FROM orders
  WHERE user_id = o.user_id
);

-- 2. 计算用户留存率（7日内复购）
WITH first_orders AS (
  SELECT user_id, MIN(DATE(created_at)) as first_date
  FROM orders
  GROUP BY user_id
),
repeat_orders AS (
  SELECT DISTINCT o.user_id
  FROM orders o
  JOIN first_orders f ON o.user_id = f.user_id
  WHERE DATE(o.created_at) > f.first_date
    AND DATE(o.created_at) <= DATE_ADD(f.first_date, INTERVAL 7 DAY)
)
SELECT
  (SELECT COUNT(*) FROM repeat_orders) / (SELECT COUNT(*) FROM first_orders) as retention_rate;

-- 3. 商品ABC分类（按销售额分类）
WITH product_sales AS (
  SELECT
    p.id,
    p.name,
    COALESCE(SUM(oi.quantity * oi.price), 0) as total_sales
  FROM products p
  LEFT JOIN order_items oi ON p.id = oi.product_id
  GROUP BY p.id, p.name
),
ranked_sales AS (
  SELECT
    *,
    SUM(total_sales) OVER (ORDER BY total_sales DESC) as cumulative_sales,
    SUM(total_sales) OVER () as grand_total
  FROM product_sales
)
SELECT
  id,
  name,
  total_sales,
  CASE
    WHEN cumulative_sales <= grand_total * 0.7 THEN 'A'
    WHEN cumulative_sales <= grand_total * 0.9 THEN 'B'
    ELSE 'C'
  END as abc_class
FROM ranked_sales;

-- 4. 连续登录天数（假设有登录日志表）
-- 使用窗口函数识别连续序列
WITH login_dates AS (
  SELECT DISTINCT user_id, DATE(created_at) as login_date
  FROM operation_logs
  WHERE action = 'LOGIN'
),
grouped AS (
  SELECT
    user_id,
    login_date,
    DATE_SUB(login_date, INTERVAL ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY login_date) DAY) as grp
  FROM login_dates
)
SELECT
  user_id,
  MIN(login_date) as start_date,
  MAX(login_date) as end_date,
  COUNT(*) as consecutive_days
FROM grouped
GROUP BY user_id, grp
HAVING COUNT(*) >= 7;

-- 5. RFM 用户分析
WITH rfm AS (
  SELECT
    user_id,
    DATEDIFF(NOW(), MAX(created_at)) as recency,
    COUNT(*) as frequency,
    SUM(total_amount) as monetary
  FROM orders
  WHERE status = 'COMPLETED'
  GROUP BY user_id
),
rfm_scored AS (
  SELECT
    user_id,
    NTILE(5) OVER (ORDER BY recency DESC) as r_score,
    NTILE(5) OVER (ORDER BY frequency) as f_score,
    NTILE(5) OVER (ORDER BY monetary) as m_score
  FROM rfm
)
SELECT
  user_id,
  r_score,
  f_score,
  m_score,
  CONCAT(r_score, f_score, m_score) as rfm_segment
FROM rfm_scored;
```

---

## 学习路径建议

| 阶段 | 内容 | 时间 |
|------|------|------|
| 入门 | SELECT、WHERE、ORDER BY、LIMIT | 1-2天 |
| 基础 | 聚合函数、GROUP BY、HAVING | 2-3天 |
| 进阶 | JOIN、子查询 | 3-5天 |
| 高级 | 窗口函数、CTE、优化 | 5-7天 |
| 实战 | 复杂报表、数据分析 | 持续练习 |

## 推荐资源

- [MySQL 官方文档](https://dev.mysql.com/doc/)
- [SQL 练习平台 - LeetCode](https://leetcode.cn/problemset/database/)
- [SQL 练习平台 - SQLZoo](https://sqlzoo.net/)
- [《SQL必知必会》](https://book.douban.com/subject/35167240/)

---

**每天练习 3-5 道题，坚持 2 周就能掌握常用 SQL！** 🚀

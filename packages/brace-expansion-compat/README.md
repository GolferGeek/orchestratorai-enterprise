# brace-expansion compatibility adapter

This private package adapts the maintained security backport in
`brace-expansion@2.1.4` for both legacy CommonJS consumers that expect the
package itself to be a function and newer consumers that use the named
`expand` export.

The adapter contains no expansion logic. It delegates to the upstream MIT
package and can be removed once every transitive consumer uses a common export
shape.

// Render the same Go text/template format consumed by UGOS Pro.
package main

import (
	"bytes"
	"encoding/json"
	"os"
	"text/template"
)

func main() {
	source, err := os.ReadFile(os.Args[1])
	if err != nil {
		panic(err)
	}
	tmpl, err := template.New("compose").Parse(string(source))
	if err != nil {
		panic(err)
	}
	cases := []struct {
		Name  string
		Value interface{}
	}{
		{"legacy-missing", nil},
		{"empty-selection", []string{}},
		{"empty-value", []string{""}},
		{"custom", []string{"/volume1/shared/KOLFlow"}},
		{"spaces-and-chinese", []string{"/volume1/共享文件夹/KOLFlow data"}},
		{"yaml-special-characters", []string{`/volume1/共享/it's a "folder" #1: data`}},
	}
	results := []map[string]string{}
	for _, test := range cases {
		values := map[string]interface{}{
			"JWT_SECRET":  []string{"isolated-template-test-secret-32-characters"},
			"INVITE_CODE": []string{"test-invite"},
		}
		expected := "./data"
		if test.Value != nil {
			values["DATA_PATH"] = test.Value
			paths := test.Value.([]string)
			if len(paths) > 0 && paths[0] != "" {
				expected = paths[0]
			}
		}
		var rendered bytes.Buffer
		if err := tmpl.Execute(&rendered, values); err != nil {
			panic(err)
		}
		results = append(results, map[string]string{"name": test.Name, "source": expected, "compose": rendered.String()})
	}
	if err := json.NewEncoder(os.Stdout).Encode(results); err != nil {
		panic(err)
	}
}
